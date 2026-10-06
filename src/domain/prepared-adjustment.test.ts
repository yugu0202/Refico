import test from "node:test";
import assert from "node:assert/strict";
import {
  createProduct,
  emptyState,
  recordPurchase,
  recordMeal,
  recordPreparedAdjustment,
  preparedBalance,
  dailyCosts,
  updatePreparedName,
} from "./inventory.ts";
import { parseState } from "./validation.ts";
const date = "2026-10-06";
function setup() {
  const product = createProduct("米", "g");
  let state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    400,
    "g",
    101,
    date,
  );
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: product.id, quantity: 400, unit: "g" }],
    { name: "ご飯", servings: 4, eatenServings: 1 },
  );
  return { state, id: state.meals[0].id };
}
test("作り置きの増加は作成時の食数を修正し、廃棄数量を保って原価を再計算する", () => {
  const { state, id } = setup();
  const costs = dailyCosts(state);
  let next = recordPreparedAdjustment(state, id, 2, date, " 廃棄 ");
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 2000,
    value: 50,
  });
  assert.deepEqual(dailyCosts(next), costs);
  assert.equal(next.preparedAdjustments![0].reason, "廃棄");
  next = recordMeal(next, "2026-10-07", "昼食", [], undefined, [
    { batchId: id, quantity: 0.5 },
  ]);
  assert.equal(next.meals[1].prepared![0].cost, 13);
  const priorCosts = dailyCosts(next);
  next = recordPreparedAdjustment(next, id, 3.5, "2026-10-07", "記録修正");
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 3500,
    value: 59,
  });
  assert.notDeepEqual(dailyCosts(next), priorCosts);
  assert.equal(next.meals[0].batch!.servings, 6);
  assert.equal(
    next.preparedAdjustments![0].beforeQuantity -
      next.preparedAdjustments![0].targetQuantity,
    1000,
  );
  next = recordMeal(next, "2026-10-08", "昼食", [], undefined, [
    { batchId: id, quantity: 1.5 },
  ]);
  next = recordMeal(next, "2026-10-09", "夕食", [], undefined, [
    { batchId: id, quantity: 2 },
  ]);
  assert.equal(
    next.meals[2].prepared![0].cost + next.meals[3].prepared![0].cost,
    59,
  );
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 0,
    value: 0,
  });
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.deepEqual(
    parseState(JSON.stringify(updatePreparedName(next, id, "新しい名前")))
      .preparedAdjustments,
    next.preparedAdjustments,
  );
  assert.deepEqual(preparedBalance(state, state.meals[0]), {
    quantity: 3000,
    value: 76,
  });
});
test("0残量への調整・復元と同じ記録位置での連続調整", () => {
  const { state, id } = setup();
  let next = recordPreparedAdjustment(state, id, 0, date);
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 0,
    value: 0,
  });
  next = recordPreparedAdjustment(next, id, 1, date);
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 1000,
    value: 20,
  });
  next = recordMeal(next, date, "夕食", [], undefined, [
    { batchId: id, quantity: 1 },
  ]);
  assert.equal(next.meals[1].prepared![0].cost, 20);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("不正な調整と破損した保存データを拒否する", () => {
  const { state, id } = setup();
  for (const quantity of [-1, NaN, Infinity, 0.0001, 3])
    assert.throws(() => recordPreparedAdjustment(state, id, quantity, date));
  assert.throws(() => recordPreparedAdjustment(state, "missing", 1, date));
  assert.throws(() => recordPreparedAdjustment(state, id, 1, "2026-10-05"));
  assert.throws(() =>
    recordPreparedAdjustment(state, id, 1, date, "x".repeat(201)),
  );
  const next = recordPreparedAdjustment(state, id, 1, "2026-10-07");
  assert.throws(() =>
    recordMeal(next, date, "夕食", [], undefined, [
      { batchId: id, quantity: 1 },
    ]),
  );
  assert.throws(() =>
    recordMeal(next, "2026-10-07", "夕食", [], undefined, [
      { batchId: id, quantity: 2 },
    ]),
  );
  for (const field of [
    "beforeQuantity",
    "targetValue",
    "beforeValue",
    "mealCount",
  ]) {
    const broken = structuredClone(next);
    (broken.preparedAdjustments![0] as unknown as Record<string, number>)[
      field
    ] += 1;
    assert.throws(() => parseState(JSON.stringify(broken)));
  }
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});

test("900円の3食分を5食分に修正し、食べた分も180円にする", () => {
  const product = createProduct("米", "g");
  let state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    300,
    "g",
    900,
    date,
  );
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: product.id, quantity: 300, unit: "g" }],
    { name: "ご飯", servings: 3, eatenServings: 1 },
  );
  const id = state.meals[0].id;
  let next = recordPreparedAdjustment(state, id, 4, date);
  assert.equal(next.meals[0].batch!.servings, 5);
  assert.deepEqual(dailyCosts(next), [[date, 180]]);
  assert.deepEqual(preparedBalance(next, next.meals[0]), {
    quantity: 4000,
    value: 720,
  });
  next = recordMeal(next, "2026-10-07", "昼食", [], undefined, [
    { batchId: id, quantity: 1 },
  ]);
  next = recordPreparedAdjustment(next, id, 5, "2026-10-07");
  assert.equal(next.meals[0].batch!.servings, 7);
  assert.equal(next.meals[1].prepared![0].cost, 128);
  next = recordMeal(next, "2026-10-08", "夕食", [], undefined, [
    { batchId: id, quantity: 5 },
  ]);
  assert.equal(
    dailyCosts(next).reduce((sum, [, cost]) => sum + cost, 0),
    900,
  );
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.equal(state.meals[0].batch!.servings, 3);
});
