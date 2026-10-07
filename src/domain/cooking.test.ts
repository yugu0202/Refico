import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema } from "./commands.ts";
import {
  emptyState,
  recordPurchase,
  recordCooking,
  recordMeal,
  stock,
  dailyCosts,
  preparedBalance,
  recordPreparedAdjustment,
  recordStockAdjustment,
} from "./inventory.ts";
import { updateCooking, updateMeal, updatePurchase } from "./history.ts";
import { toView, toModel, emptyModel } from "./model.ts";
import { parseState } from "./validation.ts";

const date = "2026-10-01";
function setup() {
  let state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "rice", name: "米", baseUnit: "g", units: [] },
  });
  state = applyCommand(state, {
    type: "product.create",
    product: { id: "egg", name: "卵", baseUnit: "個", units: [] },
  });
  state = recordPurchase(state, "rice", 1000, "g", 1000, date);
  return recordPurchase(state, "egg", 10, "個", 300, date);
}
const reload = (state: ReturnType<typeof setup>, prior = emptyModel()) =>
  parseState(JSON.stringify(toView(toModel(state, prior))));

test("作り置き登録は食事を作らず、その後に米などと合わせて食事を保存する", () => {
  let state = recordCooking(setup(), date, "卵焼き", 4, [
    { productId: "egg", quantity: 4, unit: "個" },
  ]);
  const cooking = state.cookings[0];
  assert.deepEqual(state.meals, []);
  assert.deepEqual(dailyCosts(state), []);
  assert.equal(stock(state, "egg").quantity, 6000);
  assert.deepEqual(preparedBalance(state, cooking), {
    quantity: 4000,
    value: 120,
  });
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: "rice", quantity: 150, unit: "g" }],
    [{ batchId: cooking.id, quantity: 1 }],
  );
  assert.deepEqual(dailyCosts(reload(state)), [[date, 180]]);
  assert.equal(state.meals.length, 1);
  assert.equal(stock(state, "rice").quantity, 850000);
  assert.deepEqual(preparedBalance(state, cooking), {
    quantity: 3000,
    value: 90,
  });
  assert.ok(state.meals.every((m) => !("batch" in m)));
  const before = structuredClone(state);
  assert.throws(
    () =>
      recordMeal(
        state,
        "2026-09-30",
        "夕食",
        [],
        [{ batchId: cooking.id, quantity: 1 }],
      ),
    /日付/,
  );
  assert.throws(
    () =>
      recordMeal(
        state,
        date,
        "夕食",
        [],
        [{ batchId: cooking.id, quantity: 4 }],
      ),
    /残量/,
  );
  assert.deepEqual(state, before);
});

test("既存の同時調理・食事を分離し、繰り返し保存と食事編集でID・原価を保持する", () => {
  let state = recordCooking(setup(), date, "卵焼き", 4, [
    { productId: "egg", quantity: 4, unit: "個" },
  ]);
  let model = toModel(state);
  const cooking = state.cookings[0];
  state = recordMeal(
    state,
    date,
    "夕食",
    [],
    [{ batchId: cooking.id, quantity: 1 }],
  );
  model = toModel(state, model);
  state = recordPreparedAdjustment(
    state,
    cooking.id,
    2.5,
    "2026-10-02",
    "廃棄",
  );
  model = toModel(state, model);
  state = recordStockAdjustment(state, "egg", 5, "2026-10-02", "廃棄");
  model = toModel(state, model);
  state = recordMeal(
    state,
    "2026-10-03",
    "昼食",
    [{ productId: "rice", quantity: 150, unit: "g" }],
    [{ batchId: cooking.id, quantity: 1 }],
  );
  model = toModel(state, model);
  // This is exactly how the previous version persisted an immediate meal.
  const immediate = model.meals[0];
  immediate.id = `${cooking.id}:meal`;
  immediate.cookingId = cooking.id;
  immediate.sequence = model.cookings[0].sequence;
  model.cookings[0].kind = "夕食";
  model.portions[0].mealId = immediate.id;
  model.portions[0].id = `${immediate.id}:portion:${cooking.id}`;
  let view = parseState(JSON.stringify(toView(model)));
  assert.equal(view.cookings.length, 1);
  assert.equal(view.meals.length, 2);
  assert.equal(view.meals[0].id, immediate.id);
  assert.deepEqual(dailyCosts(view), dailyCosts(state));
  assert.deepEqual(stock(view, "egg"), stock(state, "egg"));
  assert.deepEqual(
    preparedBalance(view, view.cookings[0]),
    preparedBalance(state, cooking),
  );
  const persisted = toModel(view, model);
  view = parseState(JSON.stringify(toView(persisted)));
  assert.deepEqual(toModel(view, persisted), persisted);
  // Editing the eaten portion is now independent of the cooking's date and yield.
  view = updateMeal(
    view,
    immediate.id,
    date,
    "朝食",
    [{ productId: "rice", quantity: 100, unit: "g" }],
    [{ batchId: cooking.id, quantity: 1 }],
  );
  assert.equal(view.meals[0].kind, "朝食");
  assert.equal(view.cookings[0].servings, 4);
  assert.deepEqual(dailyCosts(reload(view, persisted)), [
    ["2026-10-03", 180],
    [date, 130],
  ]);
  view = updateCooking(view, cooking.id, date, "卵料理", 5, cooking.usages);
  assert.equal(view.meals[0].id, immediate.id);
  assert.equal(view.cookings[0].servings, 5);
  assert.equal(
    preparedBalance(reload(view, persisted), view.cookings[0]).quantity,
    1500,
  );
});

test("独立した調理と食事をまたいで調整と購入価格の修正を再計算する", () => {
  let state = recordCooking(setup(), date, "卵焼き", 4, [
    { productId: "egg", quantity: 4, unit: "個" },
  ]);
  const id = state.cookings[0].id;
  state = recordMeal(state, date, "夕食", [], [{ batchId: id, quantity: 1 }]);
  state = recordPreparedAdjustment(state, id, 2, "2026-10-02", "廃棄");
  state = recordPreparedAdjustment(state, id, 4, "2026-10-02", "食数修正");
  assert.equal(state.cookings[0].servings, 6);
  assert.deepEqual(dailyCosts(reload(state)), [[date, 20]]);
  state = updatePurchase(state, state.purchases[1].id, {
    ...state.purchases[1],
    price: 600,
  });
  assert.deepEqual(dailyCosts(reload(state)), [[date, 40]]);
  assert.deepEqual(preparedBalance(reload(state), state.cookings[0]), {
    quantity: 4000,
    value: 160,
  });
  const before = structuredClone(state);
  state = updateCooking(
    state,
    id,
    date,
    "厚焼き卵",
    6,
    state.cookings[0].usages,
  );
  assert.deepEqual({ ...state, cookings: before.cookings }, before);
  assert.throws(
    () =>
      updateCooking(
        state,
        id,
        "2026-10-03",
        "卵焼き",
        6,
        state.cookings[0].usages,
      ),
    /日付|調整/,
  );
  assert.throws(
    () =>
      updateCooking(state, id, date, "卵焼き", 0.5, state.cookings[0].usages),
    /残量|廃棄/,
  );
});

test("調理コマンドに食事種別・食べた量・配分や原価を混ぜない", () => {
  const input = {
    date,
    name: "卵焼き",
    servings: 4,
    inputs: [{ productId: "egg", quantity: 4, unit: "個" }],
  };
  assert.ok(
    commandSchema.safeParse({ type: "prepared.create", input }).success,
  );
  for (const extra of [
    { kind: "夕食" },
    { eatenServings: 1 },
    { prepared: [] },
    { cost: 100 },
    { allocations: [] },
  ])
    assert.equal(
      commandSchema.safeParse({
        type: "prepared.create",
        input: { ...input, ...extra },
      }).success,
      false,
    );
  assert.equal(
    commandSchema.safeParse({
      type: "meal.create",
      input: {
        date,
        kind: "夕食",
        inputs: input.inputs,
        prepared: [],
        batch: { name: "卵焼き", servings: 4, eatenServings: 0 },
      },
    }).success,
    false,
  );
});
