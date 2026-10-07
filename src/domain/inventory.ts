import * as ledger from "./ledger.ts";
export {
  baseUnits,
  mealKinds,
  standardUnits,
  unitsFor,
  validDate,
  toBase,
  createProduct,
  cumulativeCost,
} from "./ledger.ts";
export type {
  BaseUnit,
  Unit,
  Product,
  InputAmount,
  Purchase,
  Allocation,
  Usage,
  MealInput,
  StockAdjustment,
  PreparedAdjustment,
} from "./ledger.ts";

export type Meal = Omit<ledger.Meal, "batch">;
export interface Cooking {
  id: string;
  date: string;
  name: string;
  servings: number;
  usages: ledger.Usage[];
}
export interface State extends Omit<ledger.State, "meals"> {
  meals: Meal[];
  cookings: Cooking[];
  // Both consumption types participate in allocation replay, independently of date.
  // Adjustment mealCount refers to this recording order, not the meal-only list.
  recordOrder: string[];
}
export const emptyState = (): State => ({
  ...ledger.emptyState(),
  cookings: [],
  recordOrder: [],
});

// Compatibility boundary for the allocation engine. No batch-shaped meals escape
// this module. Old immediate portions become ordinary, independently editable meals.
export function fromLedger(source: ledger.State): State {
  const meals: Meal[] = [];
  const cookings: Cooking[] = [];
  const recordOrder: string[] = [];
  const boundaries = [0];
  for (const record of source.meals) {
    recordOrder.push(record.id);
    if (!record.batch) meals.push(record);
    else {
      const { name, servings, eatenServings } = record.batch;
      cookings.push({
        id: record.id,
        date: record.date,
        name,
        servings,
        usages: record.usages,
      });
      if (eatenServings > 0) {
        const mealId = `${record.id}:meal`;
        meals.push({
          id: mealId,
          date: record.date,
          kind: record.kind,
          usages: [],
          prepared: [
            {
              batchId: record.id,
              quantity: eatenServings,
              cost: ledger.portionCost(
                record,
                Math.round(eatenServings * 1000),
              ),
            },
          ],
        });
        recordOrder.push(mealId);
      }
    }
    boundaries.push(recordOrder.length);
  }
  return {
    ...source,
    meals,
    cookings,
    recordOrder,
    ...(source.adjustments
      ? {
          adjustments: source.adjustments.map((a) => ({
            ...a,
            mealCount: boundaries[a.mealCount],
          })),
        }
      : {}),
    ...(source.preparedAdjustments
      ? {
          preparedAdjustments: source.preparedAdjustments.map((a) => ({
            ...a,
            mealCount: boundaries[a.mealCount],
          })),
        }
      : {}),
  };
}
export function toLedger(state: State): ledger.State {
  const records = new Map<string, ledger.Meal>();
  for (const cooking of state.cookings)
    records.set(cooking.id, {
      id: cooking.id,
      date: cooking.date,
      kind: "その他",
      usages: cooking.usages,
      batch: {
        name: cooking.name,
        servings: cooking.servings,
        eatenServings: 0,
      },
    });
  for (const meal of state.meals) records.set(meal.id, meal);
  const { cookings, recordOrder, ...source } = state;
  if (
    records.size !== state.cookings.length + state.meals.length ||
    new Set(recordOrder).size !== records.size ||
    recordOrder.length !== records.size ||
    recordOrder.some((id) => !records.has(id))
  )
    throw new Error("保存データの記録順を確認してください");
  return { ...source, meals: recordOrder.map((id) => records.get(id)!) };
}
const asCooking = (cooking: Cooking): ledger.Meal => ({
  id: cooking.id,
  date: cooking.date,
  kind: "その他",
  usages: cooking.usages,
  batch: { name: cooking.name, servings: cooking.servings, eatenServings: 0 },
});
export const cookingCost = (cooking: Pick<Cooking, "usages">) =>
  ledger.cookingCost({ usages: cooking.usages } as ledger.Meal);
export const mealCost = (meal: Meal) => ledger.mealCost(meal);
export const stock = (state: State, id: string) =>
  ledger.stock(toLedger(state), id);
export const consumed = (state: State, id: string) =>
  ledger.consumed(toLedger(state), id);
export const dailyCosts = (state: State) => ledger.dailyCosts(toLedger(state));
export const preparedBalance = (state: State, cooking: Cooking) =>
  ledger.preparedBalance(toLedger(state), asCooking(cooking));
export const preparedRemaining = (state: State, cooking: Cooking) =>
  preparedBalance(state, cooking).quantity / 1000;
export const recordPurchase = (
  state: State,
  ...args: Parameters<typeof ledger.recordPurchase> extends [
    unknown,
    ...infer A,
  ]
    ? A
    : never
): State => fromLedger(ledger.recordPurchase(toLedger(state), ...args));
export const updateProduct = (
  state: State,
  ...args: Parameters<typeof ledger.updateProduct> extends [unknown, ...infer A]
    ? A
    : never
): State => fromLedger(ledger.updateProduct(toLedger(state), ...args));
export const updateProductUnits = (
  state: State,
  ...args: Parameters<typeof ledger.updateProductUnits> extends [
    unknown,
    ...infer A,
  ]
    ? A
    : never
): State => fromLedger(ledger.updateProductUnits(toLedger(state), ...args));
export const recordStockAdjustment = (
  state: State,
  ...args: Parameters<typeof ledger.recordStockAdjustment> extends [
    unknown,
    ...infer A,
  ]
    ? A
    : never
): State => fromLedger(ledger.recordStockAdjustment(toLedger(state), ...args));
export const recordPreparedAdjustment = (
  state: State,
  ...args: Parameters<typeof ledger.recordPreparedAdjustment> extends [
    unknown,
    ...infer A,
  ]
    ? A
    : never
): State =>
  fromLedger(ledger.recordPreparedAdjustment(toLedger(state), ...args));
export const updatePreparedName = (
  state: State,
  id: string,
  name: string,
): State => fromLedger(ledger.updatePreparedName(toLedger(state), id, name));
export function recordMeal(
  state: State,
  date: string,
  kind: string,
  inputs: ledger.MealInput[],
  prepared: { batchId: string; quantity: number }[] = [],
  direct?: Meal["direct"],
): State {
  return fromLedger(
    ledger.recordMeal(
      toLedger(state),
      date,
      kind,
      inputs,
      undefined,
      prepared,
      [],
      direct,
    ),
  );
}
export function recordCooking(
  state: State,
  date: string,
  name: string,
  servings: number,
  inputs: ledger.MealInput[],
): State {
  return fromLedger(
    ledger.recordMeal(toLedger(state), date, "その他", inputs, {
      name,
      servings,
      eatenServings: 0,
    }),
  );
}

export const latestPurchase = (state: State, id: string, date?: string) =>
  ledger.latestPurchase(toLedger(state), id, date);
