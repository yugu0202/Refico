import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, createProduct } from "./domain/inventory.ts";
import { restoreCookingRows, type CookingDraft } from "./meal-draft.ts";

const state = emptyState();
state.products = [
  { ...createProduct("米", "g", [{ name: "合", factor: 150 }]), id: "rice" },
];
const cooking: CookingDraft = {
  key: "c",
  name: "ご飯",
  servings: "4",
  eatenServings: "1",
  rows: [
    {
      key: "ingredient",
      productId: "rice",
      batchId: "",
      quantity: "2",
      unit: "合",
    },
  ],
};

test("料理化を取り消すと食材と入力単位を戻し、元の下書きを変更しない", () => {
  const rows = [
    { key: "blank", productId: "", batchId: "", quantity: "", unit: "g" },
  ];
  assert.deepEqual(restoreCookingRows(state, rows, cooking), [
    ...rows,
    ...cooking.rows,
  ]);
  assert.equal(rows.length, 1);
  assert.equal(cooking.rows[0].quantity, "2");
});

test("料理化の取消で重複した食材を独自単位とkgから基準単位へ合算する", () => {
  const rows = [
    {
      key: "rice",
      productId: "rice",
      batchId: "",
      quantity: "0.1",
      unit: "kg",
    },
  ];
  const restored = restoreCookingRows(state, rows, cooking);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].quantity, "400");
  assert.equal(restored[0].unit, "g");
  assert.equal(restored[0].key, "rice");
  assert.equal(rows[0].quantity, "0.1");
});

test("数量が未入力の重複食材を合算しようとしても入力を失わない", () => {
  const rows = [
    { key: "rice", productId: "rice", batchId: "", quantity: "", unit: "g" },
  ];
  assert.throws(() => restoreCookingRows(state, rows, cooking));
  assert.equal(rows[0].quantity, "");
  assert.equal(cooking.rows[0].quantity, "2");
});
