import test from "node:test";
import assert from "node:assert/strict";
import {
  createProduct,
  emptyState,
  recordPurchase,
  recordMeal,
  recordStockAdjustment,
  stock,
  mealCost,
  dailyCosts,
  updateProduct,
} from "./inventory.ts";
import { parseState } from "./validation.ts";
const date = "2026-10-06";
function setup() {
  const product = createProduct("卵", "個");
  const state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    3,
    "個",
    100,
    date,
  );
  return { product, state };
}
function use(
  state: ReturnType<typeof emptyState>,
  productId: string,
  quantity: number,
) {
  return recordMeal(state, date, "夕食", [{ productId, quantity, unit: "個" }]);
}
test("食事と減少調整を交互に記録しても端数・過去の食費・再読み込みを保持する", () => {
  const { product, state } = setup();
  let next = use(state, product.id, 1);
  const original = structuredClone(next.meals);
  next = recordStockAdjustment(next, product.id, 1, date, " 廃棄 ");
  assert.deepEqual(next.meals, original);
  assert.equal(next.adjustments![0].allocations[0].cost, 34);
  assert.equal(next.adjustments![0].reason, "廃棄");
  assert.deepEqual(stock(next, product.id), { quantity: 1000, value: 33 });
  next = use(next, product.id, 1);
  assert.deepEqual(next.meals.map(mealCost), [33, 33]);
  assert.deepEqual(dailyCosts(next), [[date, 66]]);
  assert.deepEqual(stock(next, product.id), { quantity: 0, value: 0 });
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("0残量への調整は複数ロットをFIFOで消費する", () => {
  const { product, state } = setup();
  let next = recordPurchase(state, product.id, 2, "個", 90, "2026-10-05");
  next = recordStockAdjustment(next, product.id, 0, date);
  assert.deepEqual(
    next.adjustments![0].allocations.map((a) => [a.quantity, a.cost]),
    [
      [2000, 90],
      [3000, 100],
    ],
  );
  assert.deepEqual(stock(next, product.id), { quantity: 0, value: 0 });
  assert.deepEqual(dailyCosts(next), []);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("増加は購入日順の直近実購入を使い、調整ロットは単価の参照元にならない", () => {
  const { product, state } = setup();
  let next = recordPurchase(state, product.id, 2, "個", 90, "2026-10-05");
  next = recordStockAdjustment(next, product.id, 6, date);
  assert.equal(next.purchases.at(-1)!.price, 33);
  assert.equal(next.adjustments![0].sourcePurchaseId, state.purchases[0].id);
  next = recordStockAdjustment(next, product.id, 8, date);
  assert.equal(next.purchases.at(-1)!.price, 67);
  assert.deepEqual(dailyCosts(next), []);
  next = use(next, product.id, 8);
  assert.equal(mealCost(next.meals[0]), 290);
  assert.deepEqual(stock(next, product.id), { quantity: 0, value: 0 });
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("独自単位の購入を基準単位の単価に換算し、単位編集後も原価を保持する", () => {
  const product = createProduct("米", "g", [{ name: "合", factor: 150 }]);
  let state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    2,
    "合",
    100,
    date,
  );
  state = updateProduct(state, product.id, "米", [{ name: "合", factor: 160 }]);
  state = recordStockAdjustment(state, product.id, 450, date);
  assert.equal(state.purchases.at(-1)!.price, 50);
  assert.deepEqual(stock(state, product.id), { quantity: 450000, value: 150 });
  assert.deepEqual(parseState(JSON.stringify(state)), state);
});
test("増減を交互に調整し、後から過去日付の食事を記録しても再読み込みできる", () => {
  const { product, state } = setup();
  let next = recordStockAdjustment(state, product.id, 2, date);
  next = recordStockAdjustment(next, product.id, 4, date);
  next = recordMeal(next, date, "朝食", [
    { productId: product.id, quantity: 1, unit: "個" },
  ]);
  next = recordStockAdjustment(next, product.id, 1, date);
  next = recordStockAdjustment(next, product.id, 2, date);
  next = use(next, product.id, 2);
  assert.deepEqual(stock(next, product.id), { quantity: 0, value: 0 });
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("不正な調整・購入履歴なしの増加・未来購入の使用を拒否し元データを保持する", () => {
  const { product, state } = setup();
  const original = JSON.stringify(state);
  for (const quantity of [-1, NaN, Infinity, 0.0001, 3])
    assert.throws(() =>
      recordStockAdjustment(state, product.id, quantity, date),
    );
  assert.throws(() => recordStockAdjustment(state, "missing", 1, date));
  assert.throws(() =>
    recordStockAdjustment(state, product.id, 1, "2026-02-30"),
  );
  assert.throws(() =>
    recordStockAdjustment(state, product.id, 1, date, "a".repeat(201)),
  );
  assert.throws(() =>
    recordStockAdjustment(state, product.id, 1, "2026-10-05"),
  );
  assert.throws(
    () =>
      recordStockAdjustment(
        { ...emptyState(), products: [product] },
        product.id,
        1,
        date,
      ),
    /購入/,
  );
  assert.throws(
    () => recordStockAdjustment(state, product.id, 4, "2026-10-05"),
    /購入/,
  );
  assert.equal(JSON.stringify(state), original);
  assert.deepEqual(parseState(original), state);
});
test("調整履歴とロットの不正原価・数量・参照・記録順を拒否する", () => {
  const { product, state } = setup();
  const increased = recordStockAdjustment(state, product.id, 4, date);
  const reduced = recordStockAdjustment(
    use(state, product.id, 1),
    product.id,
    0,
    date,
  );
  const mutations = [
    (s: typeof increased) => {
      s.purchases.at(-1)!.price++;
    },
    (s: typeof increased) => {
      s.adjustments![0].beforeQuantity++;
    },
    (s: typeof increased) => {
      s.adjustments![0].sourcePurchaseId = "missing";
    },
    (s: typeof increased) => {
      s.adjustments![0].addedPurchaseId = "missing";
    },
    (s: typeof increased) => {
      s.adjustments![0].mealCount = 9;
    },
    (s: typeof increased) => {
      s.adjustments![0].purchaseCount = 0;
    },
  ];
  for (const mutate of mutations) {
    const broken = structuredClone(increased);
    mutate(broken);
    assert.throws(() => parseState(JSON.stringify(broken)));
  }
  const broken = structuredClone(reduced);
  broken.adjustments![0].allocations[0].cost++;
  assert.throws(() => parseState(JSON.stringify(broken)));
});
test("調整の後に購入や過去日付の食事を追加しても記録順と原価を保持する", () => {
  const { product, state } = setup();
  let next = recordPurchase(state, product.id, 2, "個", 90, "2026-10-04");
  next = recordStockAdjustment(next, product.id, 4, date);
  next = recordMeal(next, "2026-10-05", "夕食", [
    { productId: product.id, quantity: 1, unit: "個" },
  ]);
  assert.equal(mealCost(next.meals[0]), 45);
  next = recordPurchase(next, product.id, 2, "個", 80, "2026-10-05");
  next = recordStockAdjustment(next, product.id, 6, date);
  assert.equal(next.purchases.at(-1)!.price, 33);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.throws(
    () =>
      recordMeal(next, "2026-10-05", "夕食", [
        { productId: product.id, quantity: 4, unit: "個" },
      ]),
    /在庫が不足/,
  );
});
