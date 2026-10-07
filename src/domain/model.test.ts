import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema, type Command } from "./commands.ts";
import { toModel, toView, emptyModel } from "./model.ts";
import { parseState } from "./validation.ts";
import { stock, mealCost, preparedBalance, dailyCosts } from "./inventory.ts";

test("サーバーモデルで購入・調理・食事・調整の原価と記録順を保持する", () => {
  let model = emptyModel();
  const run = (command: Command) => {
    const next = applyCommand(toView(model), command);
    model = toModel(next, model);
    const view = parseState(JSON.stringify(toView(model)));
    assert.deepEqual(dailyCosts(view), dailyCosts(next));
    assert.deepEqual(
      view.meals.map((m) => [m.id, mealCost(m)]),
      next.meals.map((m) => [m.id, mealCost(m)]),
    );
    for (const p of next.products)
      assert.deepEqual(stock(view, p.id), stock(next, p.id));
    for (const m of next.meals.filter((m) => m.batch))
      assert.deepEqual(
        preparedBalance(
          view,
          view.meals.find((v) => v.id === m.id)!,
        ),
        preparedBalance(next, m),
      );
    return view;
  };
  run({
    type: "product.create",
    product: {
      id: "egg",
      name: "卵",
      baseUnit: "個",
      units: [{ name: "パック", factor: 3 }],
    },
  });
  run({
    type: "purchase.create",
    input: {
      productId: "egg",
      quantity: 3,
      unit: "パック",
      price: 900,
      date: "2026-10-01",
    },
  });
  const cooking = run({
    type: "meal.create",
    input: {
      date: "2026-10-01",
      kind: "夕食",
      inputs: [{ productId: "egg", quantity: 6, unit: "個" }],
      batch: { name: "卵料理", servings: 3, eatenServings: 1 },
      prepared: [],
    },
  }).meals[0];
  assert.equal(model.cookings.length, 1);
  assert.equal(model.meals[0].cookingId, cooking.id);
  assert.equal(model.batches[0].quantity, 3000);
  assert.equal(model.portions[0].quantity, 1000);
  run({
    type: "stock.adjust",
    id: cooking.id,
    prepared: true,
    quantity: 1.5,
    date: "2026-10-02",
    reason: "廃棄",
  });
  run({
    type: "meal.create",
    input: {
      date: "2026-10-03",
      kind: "昼食",
      inputs: [],
      prepared: [{ batchId: cooking.id, quantity: 0.5 }],
    },
  });
  run({
    type: "stock.adjust",
    id: cooking.id,
    prepared: true,
    quantity: 3,
    date: "2026-10-04",
    reason: "細かく分けた",
  });
  run({
    type: "stock.adjust",
    id: "egg",
    prepared: false,
    quantity: 4,
    date: "2026-10-04",
    reason: "記録漏れ",
  });
  assert.equal(model.purchases.length, 1);
  assert.equal(model.lots.length, 2);
  run({
    type: "meal.create",
    input: {
      date: "2026-10-04",
      kind: "夕食",
      inputs: [{ productId: "egg", quantity: 1, unit: "個" }],
      prepared: [],
    },
  });
  run({
    type: "stock.adjust",
    id: "egg",
    prepared: false,
    quantity: 2,
    date: "2026-10-04",
    reason: "廃棄",
  });
  const sequences = model.meals.map((m) => m.sequence);
  run({
    type: "purchase.update",
    id: model.purchases[0].id,
    input: {
      productId: "egg",
      quantity: 3,
      unit: "パック",
      price: 1200,
      date: "2026-10-01",
    },
  });
  assert.deepEqual(
    model.meals.map((m) => m.sequence),
    sequences,
  );
  run({ type: "prepared.rename", id: cooking.id, name: "卵焼き" });
  run({
    type: "purchase.create",
    input: {
      productId: "egg",
      quantity: 1,
      unit: "個",
      price: 30,
      date: "2026-09-30",
    },
  });
  run({
    type: "meal.update",
    id: cooking.id,
    input: {
      date: "2026-10-01",
      kind: "夕食",
      inputs: [{ productId: "egg", quantity: 6, unit: "個" }],
      batch: { name: "卵焼き", servings: 5, eatenServings: 1 },
      prepared: [],
    },
  });
  assert.equal(JSON.stringify(model).includes("mealCount"), false);
  assert.equal(JSON.stringify(model).includes("purchaseCount"), false);
});
test("全量作り置きは食事を作らず、元の履歴から編集できる", () => {
  let model = toModel(
    applyCommand(toView(emptyModel()), {
      type: "sample.create",
      date: "2026-10-01",
    }),
  );
  const next = applyCommand(toView(model), {
    type: "meal.create",
    input: {
      date: "2026-10-01",
      kind: "夕食",
      inputs: [{ productId: model.products[0].id, quantity: 100, unit: "g" }],
      batch: { name: "ご飯", servings: 2, eatenServings: 0 },
      prepared: [],
    },
  });
  model = toModel(next, model);
  assert.equal(model.cookings.length, 1);
  assert.equal(model.meals.filter((m) => m.cookingId).length, 0);
  assert.equal(
    parseState(JSON.stringify(toView(model))).meals.at(-1)!.batch!
      .eatenServings,
    0,
  );
});
test("クライアントが原価・配分・スペースIDを指定する入力を拒否する", () => {
  assert.equal(
    commandSchema.safeParse({
      type: "purchase.create",
      input: {
        productId: "egg",
        quantity: 1,
        unit: "個",
        price: 30,
        date: "2026-10-01",
        allocations: [],
      },
    }).success,
    false,
  );
  assert.equal(
    commandSchema.safeParse({
      type: "sample.create",
      date: "2026-10-01",
      spaceId: "other",
    }).success,
    false,
  );
});
