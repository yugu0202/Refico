import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import {
  stock,
  latestPurchase,
  preparedBalance,
  recordMeal,
  emptyState,
  cumulativeCost,
} from "../src/domain/inventory.ts";
import { summarizeInventory } from "../src/domain/inventory-summary.ts";
import { diffState, applyStateChanges } from "../src/domain/snapshot.ts";
export function fixture() {
  const state = emptyState();
  const date = "2026-10-01";
  for (let i = 0; i < 50; i++) {
    state.products.push({
      id: `p${i}`,
      name: `食材${i}`,
      baseUnit: "g",
      units: [],
    });
    for (let lot = 0; lot < 10; lot++)
      state.purchases.push({
        id: `p${i}:lot${lot}`,
        productId: `p${i}`,
        quantity: 1000,
        unit: "g",
        factor: 1,
        baseQuantity: 1000000,
        price: 1001,
        date,
      });
  }
  const used = new Map();
  const usage = (index, quantity) => {
    const purchase = state.purchases[index * 10];
    const before = used.get(purchase.id) ?? 0;
    const baseQuantity = quantity * 1000;
    used.set(purchase.id, before + baseQuantity);
    return {
      productId: purchase.productId,
      quantity,
      unit: "g",
      factor: 1,
      baseQuantity,
      allocations: [
        {
          purchaseId: purchase.id,
          quantity: baseQuantity,
          cost:
            cumulativeCost(purchase, before + baseQuantity) -
            cumulativeCost(purchase, before),
        },
      ],
    };
  };
  for (let i = 0; i < 20; i++) {
    state.cookings.push({
      id: `c${i}`,
      date,
      name: `料理${i}`,
      servings: 2,
      usages: [usage(i, 100)],
    });
    state.recordOrder.push(`c${i}`);
  }
  const eaten = new Map();
  for (let i = 0; i < 1000; i++) {
    const c = i % 20;
    const before = eaten.get(c) ?? 0;
    eaten.set(c, before + 10);
    const lot = { price: 100, baseQuantity: 2000 };
    state.meals.push({
      id: `m${i}`,
      date,
      kind: "夕食",
      usages: [usage(i % 50, 10)],
      prepared: [
        {
          batchId: `c${c}`,
          quantity: 0.01,
          cost: cumulativeCost(lot, before + 10) - cumulativeCost(lot, before),
        },
      ],
    });
    state.recordOrder.push(`m${i}`);
  }
  return state;
}
function median(fn) {
  fn();
  const times = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }
  return times.sort((a, b) => a - b)[2];
}
export function benchmark() {
  const state = fixture();
  const summarize = () => summarizeInventory(state);
  const original = () => ({
    products: state.products.map((p) => ({
      ...stock(state, p.id),
      latest: latestPurchase(state, p.id),
    })),
    cookings: state.cookings.map((c) => preparedBalance(state, c)),
  });
  const summary = summarize();
  const old = original();
  assert.deepEqual([...summary.products.values()], old.products);
  assert.deepEqual([...summary.cookings.values()], old.cookings);
  const next = recordMeal(state, "2026-10-01", "昼食", [
    { productId: "p0", quantity: 10, unit: "g" },
  ]);
  const changes = diffState(state, next);
  assert.deepEqual(applyStateChanges(state, changes), next);
  console.log(
    JSON.stringify(
      {
        fixture: { products: 50, purchases: 500, cookings: 20, meals: 1000 },
        medianMs: {
          previousInventory: median(original),
          sharedInventory: median(summarize),
          newMeal: median(() =>
            recordMeal(state, "2026-10-01", "昼食", [
              { productId: "p0", quantity: 10, unit: "g" },
            ]),
          ),
        },
        responseBytes: {
          full: Buffer.byteLength(JSON.stringify({ revision: 2, state: next })),
          delta: Buffer.byteLength(
            JSON.stringify({ revision: 2, baseRevision: 1, changes }),
          ),
        },
      },
      null,
      2,
    ),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  benchmark();
