import test from "node:test";
import assert from "node:assert/strict";
import { applyCommand, commandSchema, type Command } from "./commands.ts";
import { emptyState, stock, mealCost, preparedRemaining } from "./inventory.ts";
import { toModel, toView } from "./model.ts";
import { parseState } from "./validation.ts";

const date = "2026-10-12";
function setup() {
  let state = applyCommand(emptyState(), {
    type: "product.create",
    product: { id: "rice", name: "米", baseUnit: "g", units: [] },
  });
  return applyCommand(state, {
    type: "purchase.create",
    input: { productId: "rice", quantity: 1000, unit: "g", price: 1001, date },
  });
}
const command: Extract<Command, { type: "meal.create-with-cookings" }> = {
  type: "meal.create-with-cookings",
  input: {
    date,
    kind: "夕食",
    inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
    prepared: [],
    direct: { cost: 500, note: "弁当", place: "売店" },
  },
  cookings: [
    {
      name: "ご飯",
      servings: 4,
      eatenServings: 1,
      inputs: [{ productId: "rice", quantity: 400, unit: "g" }],
    },
  ],
};

test("料理化と食事を一度に作成し、食材を二重消費せず食べた分だけ食費に加える", () => {
  const original = setup();
  const next = applyCommand(original, commandSchema.parse(command));
  assert.equal(original.cookings.length, 0);
  assert.equal(original.meals.length, 0);
  assert.equal(stock(original, "rice").quantity, 1000000);
  assert.equal(next.cookings.length, 1);
  assert.equal(next.meals.length, 1);
  assert.equal(stock(next, "rice").quantity, 500000);
  assert.equal(preparedRemaining(next, next.cookings[0]), 3);
  assert.equal(mealCost(next.meals[0]), 701);
  assert.deepEqual(next.recordOrder, [next.cookings[0].id, next.meals[0].id]);
  assert.deepEqual(
    toModel(parseState(JSON.stringify(toView(toModel(next))))),
    toModel(next),
  );
  const model = toModel(next, toModel(original));
  assert.ok(model.cookings[0].sequence < model.meals[0].sequence);
});

test("複数の料理・既存の料理を混在でき、作った量を全部食べても保存できる", () => {
  let state = setup();
  state = applyCommand(state, {
    type: "prepared.create",
    input: {
      date,
      name: "既存のご飯",
      servings: 2,
      inputs: [{ productId: "rice", quantity: 100, unit: "g" }],
    },
  });
  const next = applyCommand(state, {
    ...command,
    input: {
      date,
      kind: "昼食",
      inputs: [],
      prepared: [{ batchId: state.cookings[0].id, quantity: 1 }],
    },
    cookings: [
      command.cookings[0],
      {
        ...command.cookings[0],
        name: "おにぎり",
        servings: 2,
        eatenServings: 2,
        inputs: [{ productId: "rice", quantity: 200, unit: "g" }],
      },
    ],
  });
  assert.equal(next.cookings.length, 3);
  assert.equal(next.meals[0].prepared!.length, 3);
  assert.equal(preparedRemaining(next, next.cookings[2]), 0);
  assert.equal(stock(next, "rice").quantity, 300000);
  assert.deepEqual(
    toModel(parseState(JSON.stringify(toView(toModel(next))))),
    toModel(next),
  );
});

test("後続の料理や食事で失敗しても元の在庫・記録を変更しない", () => {
  const state = setup();
  const original = structuredClone(state);
  const invalidCommands: (typeof command)[] = [
    {
      ...command,
      cookings: [
        ...command.cookings,
        {
          ...command.cookings[0],
          inputs: [{ productId: "rice", quantity: 800, unit: "g" }],
        },
      ],
    },
    {
      ...command,
      input: {
        ...command.input,
        inputs: [{ productId: "rice", quantity: 800, unit: "g" }],
      },
    },
    { ...command, input: { ...command.input, date: "2026-10-11" } },
    { ...command, cookings: [{ ...command.cookings[0], eatenServings: 5 }] },
    { ...command, cookings: [{ ...command.cookings[0], eatenServings: 0 }] },
    {
      ...command,
      cookings: [{ ...command.cookings[0], eatenServings: 0.0001 }],
    },
  ];
  for (const invalid of invalidCommands) {
    assert.throws(() => applyCommand(state, invalid));
    assert.deepEqual(state, original);
  }
});

test("料理化コマンドは原価・ID・不正な名前や量の持込みを拒否する", () => {
  for (const changes of [
    { id: "client-id" },
    { cost: 100 },
    { name: " " },
    { servings: -1 },
    { eatenServings: 0 },
    { inputs: [{ productId: "rice", quantity: NaN, unit: "g" }] },
  ])
    assert.equal(
      commandSchema.safeParse({
        ...command,
        cookings: [{ ...command.cookings[0], ...changes }],
      }).success,
      false,
    );
  assert.equal(
    commandSchema.safeParse({ ...command, cookings: [] }).success,
    false,
  );
});
