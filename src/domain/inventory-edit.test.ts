import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema } from "./commands.ts";
import {
  emptyState,
  stock,
  preparedRemaining,
  dailyCosts,
} from "./inventory.ts";
import { toModel, toView } from "./model.ts";
import { parseState } from "./validation.ts";
const date = "2026-10-08";
function setup() {
  let state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "egg", name: "卵", baseUnit: "個", units: [] },
  });
  return applyCommand(state, {
    type: "purchase.create",
    input: { productId: "egg", quantity: 10, unit: "個", price: 300, date },
  });
}
const reload = (state: ReturnType<typeof setup>) =>
  parseState(JSON.stringify(toView(toModel(state))));
const cookingInput = {
  name: "卵焼き",
  date,
  servings: 4,
  inputs: [{ productId: "egg", quantity: 4, unit: "個" }],
};
function cooked() {
  let state = applyCommand(setup(), {
    type: "prepared.create",
    input: cookingInput,
  });
  return applyCommand(state, {
    type: "meal.create",
    input: {
      date,
      kind: "夕食",
      inputs: [],
      prepared: [{ batchId: state.cookings[0].id, quantity: 1 }],
    },
  });
}
test("食材の名前・単位・残量を同時に変更し、購入と過去の食費を保持する", () => {
  const state = applyCommand(setup(), {
    type: "meal.create",
    input: {
      date,
      kind: "朝食",
      inputs: [{ productId: "egg", quantity: 2, unit: "個" }],
      prepared: [],
    },
  });
  const next = reload(
    applyCommand(
      state,
      commandSchema.parse({
        type: "product.update",
        id: "egg",
        name: "たまご",
        units: [{ name: "パック", factor: 10 }],
        adjustment: { quantity: 5, date, reason: "廃棄" },
      }),
    ),
  );
  assert.equal(next.products[0].name, "たまご");
  assert.deepEqual(next.products[0].units, [{ name: "パック", factor: 10 }]);
  assert.equal(stock(next, "egg").quantity, 5000);
  assert.deepEqual(next.purchases, state.purchases);
  assert.deepEqual(next.meals, reload(state).meals);
  assert.deepEqual(dailyCosts(next), dailyCosts(state));
  assert.equal(next.adjustments![0].reason, "廃棄");
});
test("残量変更が失敗したとき、食材名・単位も元の状態に保つ", () => {
  const state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "empty", name: "未購入", baseUnit: "g", units: [] },
  });
  const before = structuredClone(state);
  assert.throws(
    () =>
      applyCommand(state, {
        type: "product.update",
        id: "empty",
        name: "変更後",
        units: [{ name: "袋", factor: 100 }],
        adjustment: { quantity: 100, date, reason: "記録漏れ" },
      }),
    /購入/,
  );
  assert.deepEqual(state, before);
});
test("料理の編集と廃棄を同時保存し、作った食数と過去の食費を保持する", () => {
  const state = cooked();
  const next = reload(
    applyCommand(state, {
      type: "prepared.update",
      id: state.cookings[0].id,
      input: { ...cookingInput, name: "だし巻き" },
      adjustment: { quantity: 2, date, reason: "廃棄" },
    }),
  );
  assert.equal(next.cookings[0].name, "だし巻き");
  assert.equal(next.cookings[0].servings, 4);
  assert.equal(preparedRemaining(next, next.cookings[0]), 2);
  assert.deepEqual(dailyCosts(next), dailyCosts(state));
  assert.equal(next.preparedAdjustments![0].reason, "廃棄");
});
test("料理の残量増加は作った食数を修正して食費を再計算し、同量では調整を追加しない", () => {
  const state = cooked();
  const same = applyCommand(state, {
    type: "prepared.update",
    id: state.cookings[0].id,
    input: cookingInput,
    adjustment: { quantity: 3, date, reason: "" },
  });
  assert.deepEqual(same, state);
  const next = reload(
    applyCommand(state, {
      type: "prepared.update",
      id: state.cookings[0].id,
      input: cookingInput,
      adjustment: { quantity: 5, date, reason: "食数の修正" },
    }),
  );
  assert.equal(next.cookings[0].servings, 6);
  assert.equal(preparedRemaining(next, next.cookings[0]), 5);
  assert.deepEqual(dailyCosts(next), [[date, 20]]);
  assert.deepEqual(stock(next, "egg"), stock(state, "egg"));
});
test("作った食数に合わせた残量は廃棄せず、後続の残量修正失敗では名前も変更しない", () => {
  const state = cooked();
  const next = reload(
    applyCommand(state, {
      type: "prepared.update",
      id: state.cookings[0].id,
      input: { ...cookingInput, servings: 5 },
      adjustment: { quantity: 4, date, reason: "" },
    }),
  );
  assert.equal(next.cookings[0].servings, 5);
  assert.equal(preparedRemaining(next, next.cookings[0]), 4);
  assert.equal(next.preparedAdjustments!.length, 0);
  const before = structuredClone(state);
  assert.throws(
    () =>
      applyCommand(state, {
        type: "prepared.update",
        id: state.cookings[0].id,
        input: { ...cookingInput, name: "変更後" },
        adjustment: { quantity: 2, date: "2026-10-07", reason: "" },
      }),
    /作った日/,
  );
  assert.deepEqual(state, before);
});
