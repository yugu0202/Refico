import {
  cumulativeCost,
  cookingCost,
  mealCost,
  type State,
  type Purchase,
} from "./inventory.ts";

export function summarizeInventory(state: State) {
  const used = new Map<string, number>();
  for (const record of [...state.meals, ...state.cookings])
    for (const usage of record.usages)
      for (const a of usage.allocations)
        used.set(a.purchaseId, (used.get(a.purchaseId) ?? 0) + a.quantity);
  for (const adjustment of state.adjustments ?? [])
    for (const a of adjustment.allocations)
      used.set(a.purchaseId, (used.get(a.purchaseId) ?? 0) + a.quantity);
  const products = new Map(
    state.products.map((p) => [
      p.id,
      {
        quantity: 0,
        value: 0,
        latest: undefined as Purchase | undefined,
      },
    ]),
  );
  for (const p of state.purchases) {
    const balance = products.get(p.productId)!;
    const consumed = used.get(p.id) ?? 0;
    balance.quantity += p.baseQuantity - consumed;
    balance.value += p.price - cumulativeCost(p, consumed);
    if (!p.adjustmentId && (!balance.latest || p.date >= balance.latest.date))
      balance.latest = p;
  }
  const adjustments = new Map(
    (state.preparedAdjustments ?? []).map((a) => [a.batchId, a]),
  );
  const positions = new Map(state.recordOrder.map((id, index) => [id, index]));
  const portions = new Map<string, number>();
  for (const meal of state.meals)
    for (const portion of meal.prepared ?? []) {
      const after = adjustments.get(portion.batchId)?.mealCount ?? 0;
      if (positions.get(meal.id)! >= after)
        portions.set(
          portion.batchId,
          (portions.get(portion.batchId) ?? 0) +
            Math.round(portion.quantity * 1000),
        );
    }
  const cookings = new Map(
    state.cookings.map((c) => {
      const a = adjustments.get(c.id);
      const quantity = a?.targetQuantity ?? Math.round(c.servings * 1000);
      const value = a?.targetValue ?? cookingCost(c);
      const consumed = portions.get(c.id) ?? 0;
      return [
        c.id,
        {
          quantity: quantity - consumed,
          value:
            value -
            (quantity === 0
              ? 0
              : cumulativeCost(
                  { baseQuantity: quantity, price: value } as Purchase,
                  consumed,
                )),
        },
      ];
    }),
  );
  const days = new Map<string, number>();
  for (const meal of state.meals)
    days.set(meal.date, (days.get(meal.date) ?? 0) + mealCost(meal));
  return { state, products, cookings, days };
}
export type InventorySummary = ReturnType<typeof summarizeInventory>;
