import * as history from "./ledger-history.ts";
import {
  fromLedger,
  toLedger,
  updatePreparedName,
  type State,
  type Meal,
  type MealInput,
} from "./inventory.ts";
export const updatePurchase = (
  state: State,
  ...args: Parameters<typeof history.updatePurchase> extends [
    unknown,
    ...infer A,
  ]
    ? A
    : never
): State => fromLedger(history.updatePurchase(toLedger(state), ...args));
export function updateMeal(
  state: State,
  id: string,
  date: string,
  kind: string,
  inputs: MealInput[],
  prepared: { batchId: string; quantity: number }[] = [],
  direct?: Meal["direct"],
): State {
  if (!state.meals.some((m) => m.id === id))
    throw new Error("食事履歴が見つかりません");
  return fromLedger(
    history.updateMeal(
      toLedger(state),
      id,
      date,
      kind,
      inputs,
      undefined,
      prepared,
      direct,
    ),
  );
}
export function updateCooking(
  state: State,
  id: string,
  date: string,
  name: string,
  servings: number,
  inputs: MealInput[],
): State {
  const old = state.cookings.find((c) => c.id === id);
  if (!old) throw new Error("料理が見つかりません");
  if (
    date === old.date &&
    servings === old.servings &&
    inputs.length === old.usages.length &&
    inputs.every((u, index) => {
      const prior = old.usages[index];
      return (
        u.productId === prior.productId &&
        u.quantity === prior.quantity &&
        u.unit === prior.unit
      );
    })
  )
    return updatePreparedName(state, id, name);
  return fromLedger(
    history.updateMeal(toLedger(state), id, date, "その他", inputs, {
      name,
      servings,
      eatenServings: 0,
    }),
  );
}
