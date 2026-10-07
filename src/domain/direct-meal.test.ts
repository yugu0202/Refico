import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema, type Command } from "./commands.ts";
import {
  emptyState,
  stock,
  mealCost,
  dailyCosts,
  recordMeal,
} from "./inventory.ts";
import { toModel, toView } from "./model.ts";
import { parseState } from "./validation.ts";

const date = "2026-10-07";
const direct = {
  source: "direct" as const,
  date,
  kind: "昼食" as const,
  cost: 1280,
  place: " 食堂 ",
  note: " 日替わり弁当 ",
};
const reload = (state: ReturnType<typeof emptyState>) =>
  parseState(JSON.stringify(toView(toModel(state))));
function setup() {
  let state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "rice", name: "米", baseUnit: "g", units: [] },
  });
  state = applyCommand(state, {
    type: "purchase.create",
    input: { productId: "rice", quantity: 1000, unit: "g", price: 1000, date },
  });
  return state;
}

test("在庫ゼロでも外食などを保存・再読込でき、0円を未記録と区別する", () => {
  let state = applyCommand(emptyState(), {
    type: "meal.create",
    input: direct,
  });
  assert.equal(mealCost(state.meals[0]), 1280);
  assert.deepEqual(state.meals[0].direct, {
    cost: 1280,
    place: "食堂",
    note: "日替わり弁当",
  });
  assert.deepEqual(reload(state).meals[0].direct, state.meals[0].direct);
  assert.deepEqual(state.purchases, []);
  const model = toModel(state);
  for (const table of [
    "usages",
    "allocations",
    "portions",
    "cookings",
    "batches",
  ] as const)
    assert.equal(model[table].length, 0);
  state = applyCommand(state, {
    type: "meal.create",
    input: { ...direct, date: "2026-10-08", cost: 0, place: "", note: "" },
  });
  assert.deepEqual(dailyCosts(reload(state)), [
    ["2026-10-08", 0],
    [date, 1280],
  ]);
});

test("自炊と外食を合算し、外食の編集・購入の再計算でも在庫と直接金額を保つ", () => {
  let state = setup();
  state = applyCommand(state, {
    type: "meal.create",
    input: {
      date,
      kind: "夕食",
      inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
      prepared: [],
    },
  });
  const before = stock(state, "rice");
  state = applyCommand(state, { type: "meal.create", input: direct });
  assert.deepEqual(stock(state, "rice"), before);
  assert.deepEqual(dailyCosts(reload(state)), [[date, 1380]]);
  const id = state.meals[1].id;
  const priorModel = toModel(state);
  state = applyCommand(state, {
    type: "meal.update",
    id,
    input: {
      ...direct,
      cost: 980,
      date: "2026-10-08",
      kind: "夕食",
      place: "売店",
      note: "惣菜",
    },
  });
  assert.deepEqual(stock(state, "rice"), before);
  assert.equal(state.meals[1].id, id);
  const updatedModel = toModel(state, priorModel);
  assert.equal(updatedModel.meals[1].sequence, priorModel.meals[1].sequence);
  state = applyCommand(state, {
    type: "purchase.update",
    id: state.purchases[0].id,
    input: { ...state.purchases[0], price: 2000 },
  });
  assert.equal(mealCost(state.meals[0]), 200);
  assert.deepEqual(state.meals[1].direct, {
    cost: 980,
    place: "売店",
    note: "惣菜",
  });
  assert.deepEqual(dailyCosts(reload(state)), [
    ["2026-10-08", 980],
    [date, 200],
  ]);
});

test("自炊と外食の切替で使用配分を追加・削除し、後続の作り置き参照があれば拒否する", () => {
  let state = applyCommand(setup(), { type: "meal.create", input: direct });
  const id = state.meals[0].id;
  state = applyCommand(state, {
    type: "meal.update",
    id,
    input: {
      date,
      kind: "昼食",
      inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
      prepared: [],
    },
  });
  assert.equal(state.meals[0].direct, undefined);
  assert.equal(stock(state, "rice").quantity, 900000);
  state = applyCommand(state, { type: "meal.update", id, input: direct });
  assert.equal(stock(state, "rice").quantity, 1000000);
  assert.equal(toModel(reload(state)).allocations.length, 0);
  state = recordMeal(
    state,
    date,
    "夕食",
    [{ productId: "rice", quantity: 300, unit: "g" }],
    { name: "ご飯", servings: 3, eatenServings: 1 },
  );
  const batchId = state.meals[1].id;
  state = recordMeal(state, date, "その他", [], undefined, [
    { batchId, quantity: 1 },
  ]);
  const before = structuredClone(state);
  assert.throws(
    () =>
      applyCommand(state, { type: "meal.update", id: batchId, input: direct }),
    /作り置き/,
  );
  assert.deepEqual(state, before);
});

test("不正な金額・長い任意欄・在庫入力の混在を保存しない", () => {
  for (const changes of [
    { cost: -1 },
    { cost: 1.5 },
    { cost: Infinity },
    { cost: NaN },
    { cost: 100000001 },
    { place: "a".repeat(101) },
    { note: "a".repeat(501) },
    { inputs: [] },
    { prepared: [] },
    { batch: { name: "弁当", servings: 2, eatenServings: 1 } },
  ]) {
    assert.equal(
      commandSchema.safeParse({
        type: "meal.create",
        input: { ...direct, ...changes },
      }).success,
      false,
    );
  }
  const command = commandSchema.parse({ type: "meal.create", input: direct });
  assert.equal(command.type, "meal.create");
  assert.throws(
    () =>
      applyCommand(emptyState(), {
        type: "meal.create",
        input: { ...direct, date: "2026-02-30" },
      } as Command),
    /日付/,
  );
  const state = applyCommand(emptyState(), command);
  for (const cost of [-1, 0.5, 100000001]) {
    const invalid = structuredClone(state);
    invalid.meals[0].direct!.cost = cost;
    assert.throws(() => parseState(JSON.stringify(invalid)), /保存データ/);
  }
  const mixed = structuredClone(state);
  mixed.meals[0].batch = { name: "弁当", servings: 2, eatenServings: 1 };
  assert.throws(() => parseState(JSON.stringify(mixed)), /保存データ/);
});
