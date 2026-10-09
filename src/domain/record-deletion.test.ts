import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand } from "./commands.ts";
import {
  emptyState,
  createProduct,
  recordPurchase,
  recordMeal,
  recordCooking,
  recordStockAdjustment,
  recordPreparedAdjustment,
  stock,
  preparedRemaining,
  dailyCosts,
} from "./inventory.ts";
import { toModel, toView } from "./model.ts";
import { parseState } from "./validation.ts";
const date = "2026-10-01";
function setup() {
  const product = createProduct("米", "g");
  let state = { ...emptyState(), products: [product] };
  state = recordPurchase(state, product.id, 100, "g", 101, date);
  return { state, product };
}
const roundtrip = (state: ReturnType<typeof emptyState>) => {
  const view = parseState(JSON.stringify(state));
  assert.deepEqual(parseState(JSON.stringify(view)), view);
  return view;
};
test("未使用の購入を削除でき、食材は残る", () => {
  const { state, product } = setup();
  const next = applyCommand(state, {
    type: "purchase.delete",
    id: state.purchases[0].id,
  });
  assert.equal(next.purchases.length, 0);
  assert.equal(next.products[0].id, product.id);
  assert.equal(stock(roundtrip(next), product.id).quantity, 0);
  assert.equal(state.purchases.length, 1);
});
test("購入削除で後続の在庫が不足すると全体を拒否する", () => {
  let { state, product } = setup();
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 10, unit: "g" },
  ]);
  const before = JSON.stringify(state);
  assert.throws(
    () =>
      applyCommand(state, {
        type: "purchase.delete",
        id: state.purchases[0].id,
      }),
    /在庫が不足/,
  );
  assert.equal(JSON.stringify(state), before);
});
test("購入削除で利用できる別ロットへ再配分する", () => {
  let { state, product } = setup();
  state = recordPurchase(state, product.id, 100, "g", 200, date);
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 10, unit: "g" },
  ]);
  const next = roundtrip(
    applyCommand(state, { type: "purchase.delete", id: state.purchases[0].id }),
  );
  assert.deepEqual(dailyCosts(next), [[date, 20]]);
  assert.equal(stock(next, product.id).quantity, 90000);
  assert.equal(
    next.meals[0].usages[0].allocations[0].purchaseId,
    state.purchases[1].id,
  );
});
test("食事削除で食材と料理の残量を戻す", () => {
  let { state, product } = setup();
  state = recordCooking(state, date, "ご飯", 3, [
    { productId: product.id, quantity: 60, unit: "g" },
  ]);
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: product.id, quantity: 10, unit: "g" }],
    [{ batchId: state.cookings[0].id, quantity: 1 }],
  );
  const next = roundtrip(
    applyCommand(state, { type: "meal.delete", id: state.meals[0].id }),
  );
  assert.equal(next.meals.length, 0);
  assert.equal(stock(next, product.id).quantity, 40000);
  assert.equal(preparedRemaining(next, next.cookings[0]), 3);
  assert.deepEqual(dailyCosts(next), []);
});
test("削除後も後続の絶対残量修正と記録順・IDを保つ", () => {
  let { state, product } = setup();
  state = recordMeal(state, date, "昼食", [
    { productId: product.id, quantity: 10, unit: "g" },
  ]);
  state = recordStockAdjustment(state, product.id, 50, date, "実測");
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 20, unit: "g" },
  ]);
  const next = roundtrip(
    applyCommand(state, { type: "meal.delete", id: state.meals[0].id }),
  );
  assert.equal(next.adjustments![0].id, state.adjustments![0].id);
  assert.equal(next.adjustments![0].mealCount, 0);
  assert.equal(next.meals[0].id, state.meals[1].id);
  assert.equal(stock(next, product.id).quantity, 30000);
});
test("購入削除で残量修正の購入境界も更新する", () => {
  let { state, product } = setup();
  state = recordPurchase(state, product.id, 100, "g", 200, date);
  state = recordStockAdjustment(state, product.id, 250, date);
  const next = roundtrip(
    applyCommand(state, { type: "purchase.delete", id: state.purchases[0].id }),
  );
  assert.equal(next.adjustments![0].purchaseCount, 1);
  assert.equal(stock(next, product.id).quantity, 250000);
  assert.equal(next.adjustments![0].sourcePurchaseId, state.purchases[1].id);
});
test("未使用の料理を削除し、材料を在庫へ戻す", () => {
  let { state, product } = setup();
  state = recordCooking(state, date, "ご飯", 2, [
    { productId: product.id, quantity: 30, unit: "g" },
  ]);
  const next = roundtrip(
    applyCommand(state, { type: "prepared.delete", id: state.cookings[0].id }),
  );
  assert.equal(next.cookings.length, 0);
  assert.equal(stock(next, product.id).quantity, 100000);
});
test("食事や残量修正から参照されている料理は削除しない", () => {
  let { state, product } = setup();
  state = recordCooking(state, date, "ご飯", 2, [
    { productId: product.id, quantity: 30, unit: "g" },
  ]);
  const id = state.cookings[0].id;
  const eaten = recordMeal(
    state,
    date,
    "夕食",
    [],
    [{ batchId: id, quantity: 1 }],
  );
  assert.throws(
    () => applyCommand(eaten, { type: "prepared.delete", id }),
    /先に食事/,
  );
  const adjusted = recordPreparedAdjustment(state, id, 1, date);
  assert.throws(
    () => applyCommand(adjusted, { type: "prepared.delete", id }),
    /残量を修正/,
  );
});
test("金額だけの食事も削除でき、別種のIDは受け付けない", () => {
  let { state } = setup();
  state = recordMeal(state, date, "夕食", [], [], {
    cost: 800,
    place: "店",
    note: "弁当",
  });
  assert.throws(
    () =>
      applyCommand(state, { type: "prepared.delete", id: state.meals[0].id }),
    /料理/,
  );
  const next = roundtrip(
    applyCommand(state, { type: "meal.delete", id: state.meals[0].id }),
  );
  assert.deepEqual(dailyCosts(next), []);
});
