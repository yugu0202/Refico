import test from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  createProduct,
  recordPurchase,
  recordMeal,
  stock,
  mealCost,
  preparedRemaining,
  recordStockAdjustment,
  recordPreparedAdjustment,
  updateProductUnits,
  type State,
} from "./ledger.ts";
import { updatePurchase, updateMeal } from "./ledger-history.ts";
import { parseState } from "./ledger-validation.ts";

const date = "2026-10-01";
function setup() {
  const product = createProduct("米", "g", [{ name: "袋", factor: 100 }]);
  let state = { ...emptyState(), products: [product] };
  state = recordPurchase(state, product.id, 100, "g", 101, date);
  return { state, product };
}
const reload = (state: State) => parseState(JSON.stringify(state));

test("購入価格の修正で食事・作り置きの原価を再計算し、IDと残量を保持する", () => {
  let { state, product } = setup();
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: product.id, quantity: 100, unit: "g" }],
    { name: "おにぎり", servings: 3, eatenServings: 1 },
  );
  const batchId = state.meals[0].id;
  state = recordMeal(state, "2026-10-02", "昼食", [], undefined, [
    { batchId, quantity: 1 },
  ]);
  const purchase = state.purchases[0];
  const next = updatePurchase(state, purchase.id, { ...purchase, price: 201 });
  assert.equal(mealCost(next.meals[0]), 67);
  assert.equal(mealCost(next.meals[1]), 67);
  assert.equal(preparedRemaining(next, next.meals[0]), 1);
  assert.deepEqual(
    next.meals.map((m) => m.id),
    state.meals.map((m) => m.id),
  );
  assert.equal(next.purchases[0].id, purchase.id);
  assert.deepEqual(reload(next), next);
  assert.equal(state.purchases[0].price, 101);
});

test("食事使用量の修正を後続のFIFOと累積丸めに反映する", () => {
  let { state, product } = setup();
  state = recordPurchase(state, product.id, 100, "g", 200, date);
  state = recordMeal(state, date, "昼食", [
    { productId: product.id, quantity: 50, unit: "g" },
  ]);
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 100, unit: "g" },
  ]);
  const next = updateMeal(state, state.meals[0].id, date, "朝食", [
    { productId: product.id, quantity: 80, unit: "g" },
  ]);
  assert.equal(mealCost(next.meals[0]), 81);
  assert.equal(mealCost(next.meals[1]), 180);
  assert.equal(stock(next, product.id).quantity, 20000);
  assert.equal(stock(next, product.id).value, 40);
  assert.deepEqual(reload(next), next);
});

test("在庫不足・購入日と消費日の矛盾は保存せず元データを保持する", () => {
  let { state, product } = setup();
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 90, unit: "g" },
  ]);
  const before = JSON.stringify(state);
  const p = state.purchases[0];
  assert.throws(
    () => updatePurchase(state, p.id, { ...p, quantity: 80 }),
    /在庫が不足/,
  );
  assert.throws(
    () => updatePurchase(state, p.id, { ...p, date: "2026-10-02" }),
    /在庫が不足/,
  );
  assert.throws(
    () =>
      updateMeal(state, state.meals[0].id, date, "夕食", [
        { productId: product.id, quantity: 110, unit: "g" },
      ]),
    /在庫が不足/,
  );
  assert.equal(JSON.stringify(state), before);
});

test("単位設定を変更・削除したあとも履歴の換算係数で数量を編集する", () => {
  let { state, product } = setup();
  state = recordPurchase(state, product.id, 2, "袋", 400, date);
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 1, unit: "袋" },
  ]);
  state = updateProductUnits(state, product.id, []);
  const p = state.purchases[1];
  state = updatePurchase(state, p.id, { ...p, quantity: 3 });
  state = updateMeal(state, state.meals[0].id, date, "夕食", [
    { productId: product.id, quantity: 1.5, unit: "袋" },
  ]);
  assert.equal(state.purchases[1].factor, 100);
  assert.equal(state.meals[0].usages[0].factor, 100);
  assert.equal(stock(state, product.id).quantity, 250000);
  assert.deepEqual(state.products[0].units, []);
  assert.deepEqual(reload(state), state);
});

test("作り置きの作成量修正が後続の食費に反映され、消費済み量未満は拒否する", () => {
  let { state, product } = setup();
  const input = [{ productId: product.id, quantity: 100, unit: "g" }];
  state = recordMeal(state, date, "夕食", input, {
    name: "おにぎり",
    servings: 3,
    eatenServings: 1,
  });
  const id = state.meals[0].id;
  state = recordMeal(state, "2026-10-02", "昼食", [], undefined, [
    { batchId: id, quantity: 1 },
  ]);
  const next = updateMeal(state, id, date, "夕食", input, {
    name: "おにぎり",
    servings: 4,
    eatenServings: 1,
  });
  assert.equal(mealCost(next.meals[1]), 26);
  assert.equal(preparedRemaining(next, next.meals[0]), 2);
  assert.throws(
    () =>
      updateMeal(state, id, date, "夕食", input, {
        name: "おにぎり",
        servings: 1.5,
        eatenServings: 1,
      }),
    /残量が足りません/,
  );
  assert.throws(() => updateMeal(state, id, date, "夕食", input), /料理/);
  assert.deepEqual(reload(next), next);
});

test("在庫の絶対量調整を再適用し、差分ゼロや増減反転でも再読込できる", () => {
  let { state, product } = setup();
  state = recordMeal(state, date, "昼食", [
    { productId: product.id, quantity: 20, unit: "g" },
  ]);
  state = recordStockAdjustment(state, product.id, 50, date, "確認");
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 20, unit: "g" },
  ]);
  const p = state.purchases[0];
  for (const quantity of [70, 60, 120]) {
    const next = updatePurchase(state, p.id, { ...p, quantity });
    assert.equal(stock(next, product.id).quantity, 30000);
    assert.equal(next.adjustments![0].id, state.adjustments![0].id);
    assert.deepEqual(reload(next), next);
  }
});

test("増加ロットを含む複数の調整・後続購入を再構築する", () => {
  let { state, product } = setup();
  state = recordStockAdjustment(state, product.id, 150, date);
  state = recordMeal(state, date, "昼食", [
    { productId: product.id, quantity: 110, unit: "g" },
  ]);
  state = recordPurchase(state, product.id, 100, "g", 250, date);
  state = recordStockAdjustment(state, product.id, 180, date);
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 160, unit: "g" },
  ]);
  const next = updatePurchase(state, state.purchases[0].id, {
    ...state.purchases[0],
    price: 202,
  });
  assert.equal(stock(next, product.id).quantity, 20000);
  assert.deepEqual(reload(next), next);
});

test("後から遡って購入を追加しても無関係な食事のロットは維持する", () => {
  let { state, product } = setup();
  state = recordMeal(state, date, "夕食", [
    { productId: product.id, quantity: 20, unit: "g" },
  ]);
  const originalAllocation = state.meals[0].usages[0].allocations[0];
  state = recordPurchase(state, product.id, 100, "g", 500, "2026-09-30");
  const next = updatePurchase(state, state.purchases[1].id, {
    ...state.purchases[1],
    price: 600,
  });
  assert.deepEqual(next.meals[0].usages[0].allocations[0], originalAllocation);
  assert.deepEqual(reload(next), next);
});

test("食数を増加修正した後の購入価格編集も調理原価を維持する", () => {
  let { state, product } = setup();
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: product.id, quantity: 100, unit: "g" }],
    { name: "おにぎり", servings: 3, eatenServings: 1 },
  );
  state = recordPreparedAdjustment(state, state.meals[0].id, 3, date);
  state = recordMeal(state, date, "昼食", [], undefined, [
    { batchId: state.meals[0].id, quantity: 3 },
  ]);
  const next = updatePurchase(state, state.purchases[0].id, {
    ...state.purchases[0],
    price: 201,
  });
  assert.equal(next.meals[0].batch!.servings, 4);
  assert.equal(mealCost(next.meals[0]) + mealCost(next.meals[1]), 201);
  assert.deepEqual(reload(next), next);
});
