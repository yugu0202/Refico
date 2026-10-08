import test from "node:test";
import assert from "node:assert/strict";
import {
  convertStockQuantity,
  stockDisplayUnit,
  stockQuantity,
} from "./stock-amount.ts";
import {
  createProduct,
  emptyState,
  recordPurchase,
  stock,
  toBase,
} from "./inventory.ts";
import { updateProductInventory } from "./inventory-edit.ts";
const g = { name: "g", factor: 1 };
const kg = { name: "kg", factor: 1000 };

test("一覧と残量編集は同じ重量・容量の単位を選び、個数は換算しない", () => {
  assert.deepEqual(stockDisplayUnit("g", 999.999), g);
  assert.deepEqual(stockDisplayUnit("g", 1000), kg);
  assert.deepEqual(stockDisplayUnit("ml", 1000), { name: "L", factor: 1000 });
  assert.deepEqual(stockDisplayUnit("ml", 999), { name: "ml", factor: 1 });
  assert.deepEqual(stockDisplayUnit("個", 1000), { name: "個", factor: 1 });
});
test("gとkgの往復で基準単位の0.001刻みまで量を維持する", () => {
  for (const quantity of ["0", "0.001", "1234.567", "500", "1000.001"]) {
    const converted = convertStockQuantity(quantity, g, kg);
    assert.equal(stockQuantity(converted, kg), Number(quantity));
    assert.equal(convertStockQuantity(converted, kg, g), quantity);
  }
  const ml = { name: "ml", factor: 1 },
    litre = { name: "L", factor: 1000 };
  assert.equal(convertStockQuantity("1500", ml, litre), "1.5");
  assert.equal(convertStockQuantity("1.5", litre, ml), "1500");
});
test("単位を切り替えても空欄を0にせず、精度未満の入力を丸めて保存しない", () => {
  assert.equal(convertStockQuantity("", g, kg), "");
  assert.ok(Number.isNaN(stockQuantity("", kg)));
  assert.ok(Number.isNaN(stockQuantity("invalid", kg)));
  assert.throws(() => toBase(stockQuantity("0.0000001", kg), 1), /0.001/);
  assert.throws(() => toBase(stockQuantity("-1", kg), 1), /0より大きい/);
});
test("kgでの残量保存はgに正規化し、単位切替だけなら調整記録を追加しない", () => {
  const product = createProduct("米", "g");
  const state = recordPurchase(
    { ...emptyState(), products: [product] },
    product.id,
    1234.567,
    "g",
    1000,
    "2026-10-08",
  );
  const quantity = convertStockQuantity("1234.567", g, kg);
  const same = updateProductInventory(state, product.id, product.name, [], {
    quantity: stockQuantity(quantity, kg),
    date: "2026-10-08",
    reason: "",
  });
  assert.deepEqual(same, state);
  const reduced = updateProductInventory(state, product.id, product.name, [], {
    quantity: stockQuantity("0.5", kg),
    date: "2026-10-08",
    reason: "廃棄",
  });
  assert.equal(stock(reduced, product.id).quantity, 500000);
  assert.equal(reduced.adjustments![0].targetQuantity, 500000);
});
