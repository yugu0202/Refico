import { parseState } from "./validation.ts";
import {
  recordPurchase,
  recordMeal,
  recordStockAdjustment,
  recordPreparedAdjustment,
  toBase,
  type State,
  type Meal,
  type MealInput,
  type Purchase,
} from "./inventory.ts";

// Rebuild in recording order, preserving IDs, old unit factors and available
// lot assignments. Absolute stock corrections remain absolute corrections.
function rebuild(source: State): State {
  let next: State = {
    ...source,
    purchases: [],
    meals: [],
    adjustments: [],
    preparedAdjustments: [],
  };
  const adjustments = source.adjustments ?? [];
  let adjustmentIndex = 0;
  let preparedIndex = 0;
  let purchaseIndex = 0;
  const appendPurchases = (end: number) => {
    for (; purchaseIndex < end; purchaseIndex++) {
      const purchase = source.purchases[purchaseIndex];
      if (!purchase.adjustmentId) next.purchases.push(purchase);
    }
  };
  for (let index = 0; index <= source.meals.length; index++) {
    while (adjustments[adjustmentIndex]?.mealCount === index) {
      const old = adjustments[adjustmentIndex++];
      appendPurchases(old.purchaseCount);
      next = recordStockAdjustment(
        next,
        old.productId,
        old.targetQuantity / 1000,
        old.date,
        old.reason,
        true,
      );
      const fresh = next.adjustments!.at(-1)!;
      const generatedId = fresh.addedPurchaseId;
      fresh.id = old.id;
      if (generatedId) {
        const lot = next.purchases.at(-1)!;
        lot.id = old.addedPurchaseId ?? generatedId;
        lot.adjustmentId = old.id;
        fresh.addedPurchaseId = lot.id;
      }
    }
    appendPurchases(
      adjustments[adjustmentIndex]?.purchaseCount ?? source.purchases.length,
    );
    while (source.preparedAdjustments?.[preparedIndex]?.mealCount === index) {
      const old = source.preparedAdjustments[preparedIndex++];
      next = recordPreparedAdjustment(
        next,
        old.batchId,
        old.targetQuantity / 1000,
        old.date,
        old.reason,
        true,
        true,
      );
      next.preparedAdjustments!.at(-1)!.id = old.id;
    }
    if (index === source.meals.length) break;
    const meal = source.meals[index];
    try {
      next = recordMeal(
        next,
        meal.date,
        meal.kind,
        meal.usages,
        meal.batch,
        meal.prepared,
        meal.usages,
        meal.direct,
      );
      next.meals.at(-1)!.id = meal.id;
    } catch (error) {
      throw new Error(
        `${meal.date} ${meal.kind}: ${error instanceof Error ? error.message : "記録を確認してください"}`,
      );
    }
  }
  return parseState(JSON.stringify(next));
}

export function updatePurchase(
  state: State,
  id: string,
  input: Pick<Purchase, "productId" | "quantity" | "unit" | "price" | "date">,
): State {
  const old = state.purchases.find((p) => p.id === id && !p.adjustmentId);
  if (!old) throw new Error("購入履歴が見つかりません");
  // Use the recorded conversion when editing an existing historical unit.
  const sameUnit = old.productId === input.productId && old.unit === input.unit;
  const product = state.products.find((p) => p.id === input.productId);
  const validationState =
    sameUnit && product
      ? {
          ...state,
          products: state.products.map((p) =>
            p.id === product.id
              ? {
                  ...p,
                  units: [
                    ...p.units.filter((u) => u.name !== old.unit),
                    { name: old.unit, factor: old.factor },
                  ],
                }
              : p,
          ),
        }
      : state;
  const fresh = recordPurchase(
    validationState,
    input.productId,
    input.quantity,
    input.unit,
    input.price,
    input.date,
  ).purchases.at(-1)!;
  const replacement = sameUnit
    ? {
        ...fresh,
        factor: old.factor,
        baseQuantity: toBase(input.quantity, old.factor),
      }
    : fresh;
  return rebuild({
    ...state,
    purchases: state.purchases.map((p) =>
      p.id === id ? { ...replacement, id } : p,
    ),
  });
}

export function updateMeal(
  state: State,
  id: string,
  date: string,
  kind: string,
  inputs: MealInput[],
  batch?: Meal["batch"],
  prepared: { batchId: string; quantity: number }[] = [],
  direct?: Meal["direct"],
): State {
  const old = state.meals.find((m) => m.id === id);
  if (!old) throw new Error("食事履歴が見つかりません");
  // Validate and normalize using the prefix, then replay the edited meal and
  // downstream consumption atomically. A failed replay leaves state untouched.
  const index = state.meals.indexOf(old);
  const prefix = {
    ...state,
    purchases: state.purchases.filter(
      (p) =>
        !p.adjustmentId ||
        (state.adjustments ?? []).some(
          (a) => a.id === p.adjustmentId && a.mealCount <= index,
        ),
    ),
    meals: state.meals.slice(0, index),
    adjustments: (state.adjustments ?? []).filter((a) => a.mealCount <= index),
    preparedAdjustments: (state.preparedAdjustments ?? []).filter(
      (a) => a.mealCount <= index,
    ),
  };
  const fresh = recordMeal(
    prefix,
    date,
    kind,
    inputs,
    batch,
    prepared,
    old.usages,
    direct,
  ).meals.at(-1)!;
  return rebuild({
    ...state,
    meals: state.meals.map((m) => (m.id === id ? { ...fresh, id } : m)),
  });
}
