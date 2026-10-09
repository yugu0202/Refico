import test from "node:test";
import assert from "node:assert/strict";
import { summarizeInventory } from "./inventory-summary.ts";
import { sampleState } from "./sample.ts";
import {
  stock,
  latestPurchase,
  preparedBalance,
  dailyCosts,
  recordCooking,
  recordMeal,
  recordPurchase,
  recordStockAdjustment,
  recordPreparedAdjustment,
  type State,
} from "./inventory.ts";
import { applyCommand } from "./commands.ts";
const date = "2026-10-01";
function compare(state: State) {
  const summary = summarizeInventory(state);
  for (const p of state.products) {
    const { latest, ...balance } = summary.products.get(p.id)!;
    assert.deepEqual(balance, stock(state, p.id));
    assert.deepEqual(latest, latestPurchase(state, p.id));
  }
  for (const c of state.cookings)
    assert.deepEqual(summary.cookings.get(c.id), preparedBalance(state, c));
  assert.deepEqual(
    [...summary.days].sort(([a], [b]) => b.localeCompare(a)),
    dailyCosts(state),
  );
}
test("共通集計はFIFO・端数配分・同日購入・金額入力・在庫調整の従来計算と一致する", () => {
  let state = sampleState(date);
  compare(state);
  const p = state.products[0];
  state = recordPurchase(state, p.id, 100, "g", 101, date);
  state = recordCooking(state, date, "ご飯", 3, [
    { productId: p.id, quantity: 150, unit: "g" },
  ]);
  const id = state.cookings[0].id;
  state = recordMeal(
    state,
    date,
    "夕食",
    [],
    [{ batchId: id, quantity: 0.333 }],
    { cost: 500, place: "", note: "" },
  );
  compare(state);
  state = recordPreparedAdjustment(state, id, 1.7, date);
  state = recordMeal(state, date, "昼食", [], [{ batchId: id, quantity: 0.5 }]);
  compare(state);
  state = recordPreparedAdjustment(state, id, 0, date);
  state = recordStockAdjustment(state, p.id, 6000, date);
  compare(state);
  state = recordStockAdjustment(state, p.id, 500, date);
  compare(state);
  state = applyCommand(state, {
    type: "purchase.update",
    id: state.purchases[0].id,
    input: { ...state.purchases[0], price: 4100 },
  });
  compare(state);
});
