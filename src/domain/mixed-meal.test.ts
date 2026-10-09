import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema } from "./commands.ts";
import {
  emptyState,
  stock,
  preparedRemaining,
  mealCost,
  dailyCosts,
} from "./inventory.ts";
import { toModel, toView } from "./model.ts";
import { parseState } from "./validation.ts";

const date = "2026-10-08";
const paid = { cost: 650, place: " 売店 ", note: " 弁当 " };
function setup() {
  let state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "rice", name: "米", baseUnit: "g", units: [] },
  });
  state = applyCommand(state, {
    type: "purchase.create",
    input: { productId: "rice", quantity: 1000, unit: "g", price: 1000, date },
  });
  return applyCommand(state, {
    type: "prepared.create",
    input: {
      date,
      name: "ご飯",
      servings: 3,
      inputs: [{ productId: "rice", quantity: 300, unit: "g" }],
    },
  });
}
function mixed(state: ReturnType<typeof setup>) {
  return {
    date,
    kind: "夕食" as const,
    inputs: [{ productId: "rice", quantity: 50, unit: "g" }],
    prepared: [{ batchId: state.cookings[0].id, quantity: 1 }],
    direct: paid,
  };
}
const reload = (state: ReturnType<typeof setup>) =>
  parseState(JSON.stringify(toView(toModel(state))));

test("食材・料理・弁当を一つの食事として合算し、在庫と内訳を再読込できる", () => {
  let state = setup();
  state = applyCommand(
    state,
    commandSchema.parse({ type: "meal.create", input: mixed(state) }),
  );
  const meal = state.meals[0];
  assert.equal(mealCost(meal), 800);
  assert.deepEqual(dailyCosts(state), [[date, 800]]);
  assert.equal(stock(state, "rice").quantity, 650000);
  assert.equal(preparedRemaining(state, state.cookings[0]), 2);
  assert.deepEqual(meal.direct, { cost: 650, place: "売店", note: "弁当" });
  assert.deepEqual(toModel(reload(state)), toModel(state));
  const model = toModel(state);
  assert.equal(model.meals.length, 1);
  assert.equal(model.usages.length, 2);
  assert.equal(model.allocations.length, 2);
  assert.equal(model.portions.length, 1);
});

test("混在する食事を編集し、金額や最後の食材・料理を削除してもIDと記録順を保つ", () => {
  let state = setup();
  const input = mixed(state);
  state = applyCommand(state, { type: "meal.create", input });
  const id = state.meals[0].id;
  const original = toModel(state);
  state = applyCommand(state, {
    type: "meal.update",
    id,
    input: { ...input, direct: { ...paid, cost: 500 } },
  });
  assert.equal(mealCost(state.meals[0]), 650);
  assert.deepEqual(state.meals[0].usages, toView(original).meals[0].usages);
  assert.equal(stock(state, "rice").quantity, 650000);
  assert.equal(
    toModel(state, original).meals[0].sequence,
    original.meals[0].sequence,
  );
  state = applyCommand(state, {
    type: "meal.update",
    id,
    input: { ...input, direct: undefined },
  });
  assert.equal(state.meals[0].direct, undefined);
  assert.equal(mealCost(state.meals[0]), 150);
  state = applyCommand(state, {
    type: "meal.update",
    id,
    input: {
      date,
      kind: "夕食",
      inputs: [],
      prepared: [],
      direct: { cost: 0, place: "", note: "" },
    },
  });
  assert.equal(state.meals[0].id, id);
  assert.equal(stock(state, "rice").quantity, 700000);
  assert.equal(preparedRemaining(state, state.cookings[0]), 3);
  assert.deepEqual(dailyCosts(reload(state)), [[date, 0]]);
  assert.equal(toModel(state).portions.length, 0);
  assert.equal(toModel(state).usages.length, 1);
});

test("購入価格と作った食数の修正で食材・料理だけを再計算し、弁当代は保つ", () => {
  let state = setup();
  state = applyCommand(state, { type: "meal.create", input: mixed(state) });
  state = applyCommand(state, {
    type: "purchase.update",
    id: state.purchases[0].id,
    input: { ...state.purchases[0], price: 2000 },
  });
  assert.equal(mealCost(state.meals[0]), 950);
  assert.equal(state.meals[0].direct!.cost, 650);
  const cooking = state.cookings[0];
  state = applyCommand(state, {
    type: "prepared.update",
    id: cooking.id,
    input: { date, name: cooking.name, servings: 6, inputs: cooking.usages },
  });
  assert.equal(mealCost(state.meals[0]), 850);
  assert.equal(state.meals[0].direct!.cost, 650);
  assert.deepEqual(dailyCosts(reload(state)), [[date, 850]]);
});

test("混在する食事でも在庫不足・未来の購入・不正な金額・空記録を拒否する", () => {
  const state = setup();
  const input = mixed(state);
  for (const changes of [
    { inputs: [{ productId: "rice", quantity: 1000, unit: "g" }] },
    { date: "2026-10-07", prepared: [] },
    { prepared: [{ batchId: state.cookings[0].id, quantity: 4 }] },
    { direct: { ...paid, cost: -1 } },
  ]) {
    assert.throws(() =>
      applyCommand(state, {
        type: "meal.create",
        input: { ...input, ...changes },
      }),
    );
  }
  for (const cost of [-1, 1.5, 100000001, Infinity, NaN])
    assert.equal(
      commandSchema.safeParse({
        type: "meal.create",
        input: { ...input, direct: { ...paid, cost } },
      }).success,
      false,
    );
  assert.throws(
    () =>
      applyCommand(state, {
        type: "meal.create",
        input: { date, kind: "夕食", inputs: [], prepared: [] },
      }),
    /食材・料理を選ぶか、金額を入力/,
  );
  assert.equal(state.meals.length, 0);
  assert.equal(stock(state, "rice").quantity, 700000);
  assert.equal(preparedRemaining(state, state.cookings[0]), 3);
});
