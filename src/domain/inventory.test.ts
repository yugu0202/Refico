import test from "node:test";
import assert from "node:assert/strict";
import {
  createProduct,
  emptyState,
  recordMeal,
  recordPurchase,
  mealCost,
  stock,
  dailyCosts,
  toBase,
  updateProductUnits,
  updateProduct,
  updatePreparedName,
  preparedRemaining,
} from "./ledger.ts";
import { parseState } from "./ledger-validation.ts";
const date = "2026-10-06";
function rice() {
  const product = createProduct("白米", "g", [{ name: "合", factor: 150 }]);
  return { product, state: { ...emptyState(), products: [product] } };
}
test("食材名と単位を編集しても食材ID・基準単位・在庫・購入使用履歴を保持する", () => {
  const { product, state } = rice();
  const purchased = recordPurchase(state, product.id, 5, "kg", 4000, date);
  const before = recordMeal(purchased, date, "夕食", [
    { productId: product.id, quantity: 2, unit: "合" },
  ]);
  const next = updateProduct(before, product.id, " 無洗米 ", [
    { name: "合", factor: 155 },
  ]);
  assert.equal(next.products[0].name, "無洗米");
  assert.equal(next.products[0].id, product.id);
  assert.equal(next.products[0].baseUnit, "g");
  assert.deepEqual(stock(next, product.id), stock(before, product.id));
  assert.deepEqual(next.purchases, before.purchases);
  assert.deepEqual(next.meals, before.meals);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.equal(before.products[0].name, "白米");
});
test("食材名編集は空白・文字数超過・他食材との重複を拒否し、自分の名前は維持できる", () => {
  const { product, state } = rice();
  state.products.push(createProduct("卵", "個"));
  for (const name of [" ", "米".repeat(101), " 卵 "])
    assert.throws(() => updateProduct(state, product.id, name, product.units));
  assert.equal(
    updateProduct(state, product.id, "白米", product.units).products[0].name,
    "白米",
  );
  assert.throws(() => updateProduct(state, "missing", "白米", []));
});
test("単位を変更・削除しても履歴と在庫原価を維持し、新しい記録だけ新換算を使う", () => {
  const { product, state } = rice();
  let next = recordPurchase(state, product.id, 10, "合", 1500, date);
  next = recordMeal(next, date, "昼食", [
    { productId: product.id, quantity: 1, unit: "合" },
  ]);
  const before = next;
  next = updateProductUnits(next, product.id, [
    { name: "合", factor: 160 },
    { name: "カップ", factor: 200 },
  ]);
  assert.deepEqual(next.purchases, before.purchases);
  assert.deepEqual(next.meals, before.meals);
  assert.deepEqual(stock(next, product.id), stock(before, product.id));
  next = recordMeal(next, date, "夕食", [
    { productId: product.id, quantity: 1, unit: "合" },
  ]);
  assert.equal(next.meals[1].usages[0].baseQuantity, 160000);
  assert.equal(mealCost(next.meals[1]), 160);
  next = updateProductUnits(next, product.id, [
    { name: "計量カップ", factor: 200 },
  ]);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.throws(() => recordPurchase(next, product.id, 1, "合", 100, date));
  assert.equal(before.products[0].units[0].factor, 150);
});
test("単位編集は重複・標準単位との衝突・不正換算を拒否する", () => {
  const { product, state } = rice();
  for (const units of [
    [{ name: "g", factor: 2 }],
    [
      { name: "合", factor: 150 },
      { name: " 合 ", factor: 160 },
    ],
    [{ name: "", factor: 150 }],
    [{ name: "合", factor: 0 }],
    [{ name: "合", factor: NaN }],
  ])
    assert.throws(() => updateProductUnits(state, product.id, units));
  assert.throws(() => updateProductUnits(state, "missing", []));
  assert.deepEqual(
    updateProductUnits(state, product.id, []).products[0].units,
    [],
  );
});
test("kgで購入した米を合で使い、金額・在庫・入力単位を保持する", () => {
  const { product, state } = rice();
  const purchased = recordPurchase(state, product.id, 5, "kg", 4000, date);
  const next = recordMeal(purchased, date, "夕食", [
    { productId: product.id, quantity: 2, unit: "合" },
  ]);
  assert.equal(mealCost(next.meals[0]), 240);
  assert.deepEqual(stock(next, product.id), { quantity: 4700000, value: 3760 });
  assert.equal(next.meals[0].usages[0].unit, "合");
  assert.deepEqual(dailyCosts(next), [[date, 240]]);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
});
test("購入日順のFIFOで2ロットに配分する", () => {
  const { product, state } = rice();
  let next = recordPurchase(state, product.id, 100, "g", 100, date);
  next = recordPurchase(next, product.id, 200, "g", 100, "2026-10-05");
  next = recordMeal(next, date, "昼食", [
    { productId: product.id, quantity: 250, unit: "g" },
  ]);
  assert.equal(mealCost(next.meals[0]), 150);
  assert.deepEqual(
    next.meals[0].usages[0].allocations.map((a) => a.quantity),
    [200000, 50000],
  );
  assert.deepEqual(stock(next, product.id), { quantity: 50000, value: 50 });
});
test("端数配分の合計は購入価格と一致する", () => {
  const product = createProduct("卵", "個");
  let state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    3,
    "個",
    100,
    date,
  );
  for (let i = 0; i < 3; i++)
    state = recordMeal(state, date, "朝食", [
      { productId: product.id, quantity: 1, unit: "個" },
    ]);
  assert.deepEqual(state.meals.map(mealCost), [33, 34, 33]);
  assert.deepEqual(stock(state, product.id), { quantity: 0, value: 0 });
});
test("在庫不足の複数食材の記録は全体を変更しない", () => {
  const { product, state } = rice();
  const other = createProduct("牛乳", "ml");
  let next = { ...state, products: [...state.products, other] };
  next = recordPurchase(next, product.id, 1, "kg", 1000, date);
  next = recordPurchase(next, other.id, 100, "ml", 100, date);
  const original = JSON.stringify(next);
  assert.throws(
    () =>
      recordMeal(next, date, "昼食", [
        { productId: product.id, quantity: 1, unit: "合" },
        { productId: other.id, quantity: 200, unit: "ml" },
      ]),
    /在庫が不足/,
  );
  assert.equal(JSON.stringify(next), original);
});
test("食事の日付より後の購入を使えない", () => {
  const { product, state } = rice();
  const next = recordPurchase(state, product.id, 1, "kg", 100, date);
  assert.throws(
    () =>
      recordMeal(next, "2026-10-05", "夕食", [
        { productId: product.id, quantity: 1, unit: "合" },
      ]),
    /在庫が不足/,
  );
});
test("不正数量・重複単位・不正日付・重複食材を拒否する", () => {
  for (const q of [0, -1, Infinity, NaN, 0.0001])
    assert.throws(() => toBase(q, 1));
  assert.throws(() => createProduct("米", "g", [{ name: "kg", factor: 1 }]));
  const { product, state } = rice();
  assert.throws(() =>
    recordPurchase(state, product.id, 1, "kg", 100, "2026-02-30"),
  );
  const purchased = recordPurchase(state, product.id, 1, "kg", 100, date);
  assert.throws(
    () =>
      recordMeal(
        purchased,
        date,
        "夕食",
        [1, 2].map(() => ({ productId: product.id, quantity: 1, unit: "合" })),
      ),
    /1行/,
  );
});
test("破損データと過剰消費データを読み込まない", () => {
  assert.throws(() => parseState("{broken"));
  assert.throws(() => parseState('{"version":2}'));
  const { product, state } = rice();
  const next = recordMeal(
    recordPurchase(state, product.id, 1, "kg", 100, date),
    date,
    "夕食",
    [{ productId: product.id, quantity: 1, unit: "合" }],
  );
  next.meals[0].usages[0].allocations[0].quantity = 2000000;
  assert.throws(() => parseState(JSON.stringify(next)));
});
test("作り置きは調理時に在庫を消費し、食べた日ごとに原価を配分する", () => {
  const { product, state } = rice();
  let next = recordPurchase(state, product.id, 300, "g", 100, date);
  next = recordMeal(
    next,
    date,
    "夕食",
    [{ productId: product.id, quantity: 300, unit: "g" }],
    { name: "ご飯", servings: 3, eatenServings: 1 },
  );
  const batchId = next.meals[0].id;
  assert.deepEqual(stock(next, product.id), { quantity: 0, value: 0 });
  next = recordMeal(next, "2026-10-07", "昼食", [], undefined, [
    { batchId, quantity: 1 },
  ]);
  next = recordMeal(next, "2026-10-08", "昼食", [], undefined, [
    { batchId, quantity: 1 },
  ]);
  assert.deepEqual(next.meals.map(mealCost), [33, 34, 33]);
  assert.deepEqual(dailyCosts(next), [
    ["2026-10-08", 33],
    ["2026-10-07", 34],
    [date, 33],
  ]);
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  assert.throws(
    () =>
      recordMeal(next, "2026-10-09", "昼食", [], undefined, [
        { batchId, quantity: 1 },
      ]),
    /残量/,
  );
});
test("全量作り置きと小数食分・直接使う食材を組み合わせる", () => {
  const { product, state } = rice();
  let next = recordPurchase(state, product.id, 300, "g", 100, date);
  next = recordMeal(
    next,
    date,
    "夕食",
    [{ productId: product.id, quantity: 150, unit: "g" }],
    { name: "ご飯", servings: 1.5, eatenServings: 0 },
  );
  assert.deepEqual(dailyCosts(next), []);
  const batchId = next.meals[0].id;
  assert.throws(() =>
    recordMeal(next, "2026-10-05", "昼食", [], undefined, [
      { batchId, quantity: 0.5 },
    ]),
  );
  next = recordMeal(
    next,
    "2026-10-07",
    "昼食",
    [{ productId: product.id, quantity: 150, unit: "g" }],
    undefined,
    [{ batchId, quantity: 0.5 }],
  );
  next = recordMeal(next, "2026-10-08", "昼食", [], undefined, [
    { batchId, quantity: 1 },
  ]);
  assert.equal(
    next.meals.reduce((s, m) => s + mealCost(m), 0),
    100,
  );
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  const broken = structuredClone(next);
  broken.meals[1].prepared![0].cost++;
  assert.throws(() => parseState(JSON.stringify(broken)));
  const over = structuredClone(next);
  over.meals[2].prepared![0].quantity = 2;
  assert.throws(() => parseState(JSON.stringify(over)));
});
test("作り置きの不正入力を拒否して元の記録を保持する", () => {
  const { product, state } = rice();
  const next = recordPurchase(state, product.id, 300, "g", 100, date);
  const raw = JSON.stringify(next);
  for (const batch of [
    { name: "", servings: 4, eatenServings: 1 },
    { name: "米", servings: 0, eatenServings: 0 },
    { name: "米", servings: 4, eatenServings: -1 },
    { name: "米", servings: 4, eatenServings: 4 },
    { name: "米", servings: 4, eatenServings: 0.0001 },
  ])
    assert.throws(() =>
      recordMeal(
        next,
        date,
        "夕食",
        [{ productId: product.id, quantity: 300, unit: "g" }],
        batch,
      ),
    );
  assert.equal(JSON.stringify(next), raw);
});

test("作り置きの名前変更で残量・原価・履歴の配分を保持する", () => {
  const { product, state } = rice();
  let before = recordPurchase(state, product.id, 300, "g", 100, date);
  before = recordMeal(
    before,
    date,
    "夕食",
    [{ productId: product.id, quantity: 300, unit: "g" }],
    { name: "ご飯", servings: 3, eatenServings: 1 },
  );
  const id = before.meals[0].id;
  before = recordMeal(before, "2026-10-07", "昼食", [], undefined, [
    { batchId: id, quantity: 1 },
  ]);
  const next = updatePreparedName(before, id, "  炊き込みご飯  ");
  assert.equal(next.meals[0].batch?.name, "炊き込みご飯");
  assert.equal(before.meals[0].batch?.name, "ご飯");
  assert.deepEqual(next, {
    ...before,
    meals: [
      {
        ...before.meals[0],
        batch: { ...before.meals[0].batch!, name: "炊き込みご飯" },
      },
      before.meals[1],
    ],
  });
  assert.equal(
    preparedRemaining(next, next.meals[0]),
    preparedRemaining(before, before.meals[0]),
  );
  assert.deepEqual(dailyCosts(next), dailyCosts(before));
  assert.deepEqual(parseState(JSON.stringify(next)), next);
  for (const name of ["", "   ", "a".repeat(101)])
    assert.throws(() => updatePreparedName(before, id, name), /100文字/);
  assert.throws(
    () => updatePreparedName(before, "missing", "料理"),
    /見つかりません/,
  );
  assert.throws(
    () => updatePreparedName(before, before.meals[1].id, "料理"),
    /見つかりません/,
  );
});
