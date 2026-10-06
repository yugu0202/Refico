import {
  emptyState,
  type State,
  validDate,
  toBase,
  baseUnits,
  unitsFor,
  mealKinds,
  cumulativeCost,
  preparedUsageCost,
  recordPreparedAdjustment,
  recordStockAdjustment,
} from "./inventory.ts";
const KEY = "refico:v1";
// Validate stored data before allowing edits. Malformed data is preserved for recovery.
export function parseState(raw: string): State {
  const state: State = JSON.parse(raw);
  const check = (ok: boolean) => {
    if (!ok)
      throw new Error(
        "保存データを読み込めません。別のブラウザや開発者ツールで保存データを確認してください",
      );
  };
  check(
    state?.version === 1 &&
      Array.isArray(state.products) &&
      Array.isArray(state.purchases) &&
      Array.isArray(state.meals),
  );
  const ids = new Set<string>();
  const id = (value: string) => {
    check(typeof value === "string" && value.length > 0 && !ids.has(value));
    ids.add(value);
  };
  for (const p of state.products) {
    id(p.id);
    check(
      typeof p.name === "string" &&
        p.name.trim().length > 0 &&
        baseUnits.includes(p.baseUnit) &&
        Array.isArray(p.units),
    );
    const names = new Set<string>();
    for (const u of unitsFor(p)) {
      check(
        typeof u.name === "string" && u.name.length > 0 && !names.has(u.name),
      );
      toBase(1, u.factor);
      names.add(u.name);
    }
  }
  for (const p of state.purchases) {
    id(p.id);
    check(
      state.products.some((product) => product.id === p.productId) &&
        validDate(p.date) &&
        Number.isSafeInteger(p.price) &&
        p.price >= 0 &&
        p.price <= 100000000 &&
        typeof p.unit === "string",
    );
    check(toBase(p.quantity, p.factor) === p.baseQuantity);
  }
  check(state.adjustments === undefined || Array.isArray(state.adjustments));
  const adjustments = state.adjustments ?? [];
  let mealPosition = 0;
  let purchasePosition = 0;
  for (const a of adjustments) {
    id(a.id);
    check(
      state.products.some((p) => p.id === a.productId) &&
        validDate(a.date) &&
        typeof a.reason === "string" &&
        a.reason.length <= 200 &&
        Number.isSafeInteger(a.beforeQuantity) &&
        a.beforeQuantity >= 0 &&
        Number.isSafeInteger(a.targetQuantity) &&
        a.targetQuantity >= 0 &&
        Array.isArray(a.allocations) &&
        Number.isSafeInteger(a.mealCount) &&
        a.mealCount >= mealPosition &&
        a.mealCount <= state.meals.length &&
        Number.isSafeInteger(a.purchaseCount) &&
        a.purchaseCount >= purchasePosition &&
        a.purchaseCount <= state.purchases.length,
    );
    mealPosition = a.mealCount;
    purchasePosition = a.purchaseCount + (a.addedPurchaseId ? 1 : 0);
  }
  for (const p of state.purchases) {
    check(
      p.adjustmentId === undefined ||
        adjustments.some(
          (a) => a.id === p.adjustmentId && a.addedPurchaseId === p.id,
        ),
    );
  }
  const totals = new Map<string, { quantity: number; cost: number }>();
  for (const meal of state.meals) {
    id(meal.id);
    check(
      validDate(meal.date) &&
        mealKinds.includes(meal.kind) &&
        Array.isArray(meal.usages) &&
        (meal.usages.length > 0 ||
          (Array.isArray(meal.prepared) && meal.prepared.length > 0)),
    );
  }
  // Replay consumption in recording order, including reductions between meals.
  const events = [
    ...state.meals.map((meal, index) => ({
      date: meal.date,
      usages: meal.usages,
      order: index * 2 + 1,
      mealIndex: index,
    })),
    ...adjustments
      .filter((a) => a.targetQuantity < a.beforeQuantity)
      .map((a) => ({
        date: a.date,
        order: a.mealCount * 2,
        mealIndex: a.mealCount,
        usages: [
          {
            productId: a.productId,
            quantity: (a.beforeQuantity - a.targetQuantity) / 1000,
            unit: state.products.find((p) => p.id === a.productId)!.baseUnit,
            factor: 1,
            baseQuantity: a.beforeQuantity - a.targetQuantity,
            allocations: a.allocations,
          },
        ],
      })),
  ].sort((a, b) => a.order - b.order);
  for (const meal of events) {
    for (const usage of meal.usages) {
      check(
        state.products.some((p) => p.id === usage.productId) &&
          typeof usage.unit === "string" &&
          toBase(usage.quantity, usage.factor) === usage.baseQuantity &&
          Array.isArray(usage.allocations),
      );
      let allocated = 0;
      for (const a of usage.allocations) {
        const purchase = state.purchases.find((p) => p.id === a.purchaseId);
        check(
          !!purchase &&
            purchase.productId === usage.productId &&
            purchase.date <= meal.date &&
            (!purchase.adjustmentId ||
              adjustments.some(
                (a) =>
                  a.id === purchase.adjustmentId &&
                  a.mealCount <= meal.mealIndex,
              )) &&
            Number.isSafeInteger(a.quantity) &&
            a.quantity > 0 &&
            Number.isSafeInteger(a.cost) &&
            a.cost >= 0,
        );
        const prior = totals.get(a.purchaseId) ?? { quantity: 0, cost: 0 };
        const next = {
          quantity: prior.quantity + a.quantity,
          cost: prior.cost + a.cost,
        };
        check(
          next.quantity <= purchase!.baseQuantity &&
            a.cost ===
              cumulativeCost(purchase!, next.quantity) -
                cumulativeCost(purchase!, prior.quantity),
        );
        totals.set(a.purchaseId, next);
        allocated += a.quantity;
      }
      check(allocated === usage.baseQuantity);
    }
  }
  // Validate the target, FIFO allocation and inferred price against the saved snapshot.
  for (const [index, a] of adjustments.entries()) {
    const prior: State = {
      ...state,
      meals: state.meals.slice(0, a.mealCount),
      purchases: state.purchases.slice(0, a.purchaseCount),
      adjustments: adjustments.slice(0, index),
    };
    const expected = recordStockAdjustment(
      prior,
      a.productId,
      a.targetQuantity / 1000,
      a.date,
      a.reason,
      true,
    );
    const adjustment = expected.adjustments!.at(-1)!;
    check(
      a.beforeQuantity === adjustment.beforeQuantity &&
        a.allocations.length === adjustment.allocations.length &&
        a.allocations.every((allocation, index) => {
          const expected = adjustment.allocations[index];
          return (
            allocation.purchaseId === expected.purchaseId &&
            allocation.quantity === expected.quantity &&
            allocation.cost === expected.cost
          );
        }) &&
        a.sourcePurchaseId === adjustment.sourcePurchaseId,
    );
    if (a.targetQuantity > a.beforeQuantity) {
      const actual = state.purchases[a.purchaseCount];
      const added = expected.purchases.at(-1)!;
      check(
        a.allocations.length === 0 &&
          !!actual &&
          actual.id === a.addedPurchaseId &&
          actual.adjustmentId === a.id &&
          actual.productId === added.productId &&
          actual.date === added.date &&
          actual.baseQuantity === added.baseQuantity &&
          actual.price === added.price &&
          actual.quantity === added.quantity &&
          actual.factor === 1 &&
          actual.unit === added.unit,
      );
    } else {
      check(
        a.addedPurchaseId === undefined && a.sourcePurchaseId === undefined,
      );
    }
  }
  check(
    state.preparedAdjustments === undefined ||
      Array.isArray(state.preparedAdjustments),
  );
  const preparedAdjustments = state.preparedAdjustments ?? [];
  let position = 0;
  for (const a of preparedAdjustments) {
    id(a.id);
    check(
      validDate(a.date) &&
        typeof a.reason === "string" &&
        a.reason.length <= 200 &&
        Number.isSafeInteger(a.mealCount) &&
        a.mealCount >= position &&
        a.mealCount <= state.meals.length &&
        [
          a.beforeQuantity,
          a.targetQuantity,
          a.beforeValue,
          a.targetValue,
        ].every((v) => Number.isSafeInteger(v) && v >= 0),
    );
    position = a.mealCount;
  }
  let adjustmentIndex = 0;
  for (let mealIndex = 0; mealIndex <= state.meals.length; mealIndex++) {
    while (preparedAdjustments[adjustmentIndex]?.mealCount === mealIndex) {
      const a = preparedAdjustments[adjustmentIndex];
      const prior = {
        ...state,
        meals: state.meals.slice(0, mealIndex),
        preparedAdjustments: preparedAdjustments.slice(0, adjustmentIndex),
      };
      const expected = recordPreparedAdjustment(
        prior,
        a.batchId,
        a.targetQuantity / 1000,
        a.date,
        a.reason,
        true,
        true,
      ).preparedAdjustments!.at(-1)!;
      check(
        a.beforeQuantity === expected.beforeQuantity &&
          a.beforeValue === expected.beforeValue &&
          a.targetValue === expected.targetValue,
      );
      adjustmentIndex++;
    }
    if (mealIndex === state.meals.length) break;
    const meal = state.meals[mealIndex];
    if (meal.batch !== undefined) {
      const b = meal.batch;
      check(
        !!b &&
          typeof b.name === "string" &&
          b.name.trim().length > 0 &&
          b.name.length <= 100 &&
          meal.usages.length > 0 &&
          !meal.prepared?.length,
      );
      toBase(b.servings, 1);
      check(
        Number.isFinite(b.eatenServings) &&
          b.eatenServings >= 0 &&
          b.eatenServings < b.servings,
      );
      if (b.eatenServings > 0) toBase(b.eatenServings, 1);
    }
    if (meal.prepared !== undefined) {
      check(Array.isArray(meal.prepared));
      const seen = new Set<string>();
      for (const p of meal.prepared) {
        const source = state.meals.find((m) => m.id === p.batchId);
        check(
          !!source?.batch &&
            state.meals.slice(0, mealIndex).some((m) => m.id === p.batchId) &&
            source!.date <= meal.date &&
            !seen.has(p.batchId),
        );
        seen.add(p.batchId);
        const prior = {
          ...state,
          meals: state.meals.slice(0, mealIndex),
          preparedAdjustments: preparedAdjustments.slice(0, adjustmentIndex),
        };
        check(
          Number.isSafeInteger(p.cost) &&
            p.cost ===
              preparedUsageCost(
                prior,
                source!,
                toBase(p.quantity, 1),
                meal.date,
              ),
        );
      }
    }
  }
  return state;
}
export function loadState(): State {
  const raw = localStorage.getItem(KEY);
  return raw ? parseState(raw) : emptyState();
}
export function saveState(state: State): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
