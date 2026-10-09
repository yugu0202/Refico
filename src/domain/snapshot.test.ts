import test from "node:test";
import assert from "node:assert/strict";
import { emptyModel, toModel, toView } from "./model.ts";
import { applyCommand, type Command } from "./commands.ts";
import { applyStateChanges, diffState } from "./snapshot.ts";
import { parseState } from "./validation.ts";
const date = "2026-10-01";
test("差分から購入・料理・食事・残量修正・履歴削除を正しい順序で復元する", () => {
  let model = emptyModel();
  const run = (command: Command) => {
    const previous = toView(model);
    const next = applyCommand(previous, command);
    model = toModel(next, model);
    const after = toView(model);
    const changes = JSON.parse(JSON.stringify(diffState(previous, after)));
    const patched = applyStateChanges(previous, changes);
    assert.deepEqual(
      JSON.parse(JSON.stringify(patched)),
      JSON.parse(JSON.stringify(after)),
    );
    parseState(JSON.stringify(patched));
    return after;
  };
  run({
    type: "product.create",
    product: { id: "rice", name: "米", baseUnit: "g", units: [] },
  });
  run({
    type: "purchase.create",
    input: { productId: "rice", quantity: 1000, unit: "g", price: 1001, date },
  });
  const cooking = run({
    type: "prepared.create",
    input: {
      date,
      name: "ご飯",
      servings: 3,
      inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
    },
  }).cookings[0];
  const meal = run({
    type: "meal.create",
    input: {
      date,
      kind: "夕食",
      inputs: [],
      prepared: [{ batchId: cooking.id, quantity: 1 }],
    },
  }).meals[0];
  run({
    type: "stock.adjust",
    prepared: false,
    id: "rice",
    quantity: 800,
    date,
    reason: "実測",
  });
  run({
    type: "stock.adjust",
    prepared: true,
    id: cooking.id,
    quantity: 1.5,
    date,
    reason: "廃棄",
  });
  run({ type: "meal.delete", id: meal.id });
  const unused = run({
    type: "prepared.create",
    input: {
      date,
      name: "ご飯",
      servings: 2,
      inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
    },
  }).cookings.at(-1)!;
  run({ type: "prepared.delete", id: unused.id });
  const purchase = run({
    type: "purchase.create",
    input: { productId: "rice", quantity: 500, unit: "g", price: 501, date },
  }).purchases.at(-1)!;
  run({ type: "purchase.delete", id: purchase.id });
  run({
    type: "purchase.update",
    id: toView(model).purchases[0].id,
    input: { productId: "rice", quantity: 1000, unit: "g", price: 1100, date },
  });
});
test("並び替え・削除の差分が既存配列を変更せず、変更しない配列は共有する", () => {
  const before = toView(emptyModel());
  before.products = ["a", "b", "c"].map((id) => ({
    id,
    name: id,
    baseUnit: "g",
    units: [],
  }));
  const after = {
    ...before,
    products: [before.products[2], before.products[0]],
  };
  const patched = applyStateChanges(before, diffState(before, after));
  assert.deepEqual(patched, after);
  assert.equal(patched.meals, before.meals);
  assert.deepEqual(
    before.products.map((p) => p.id),
    ["a", "b", "c"],
  );
});
