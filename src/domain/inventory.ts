export type BaseUnit = "g" | "ml" | "個";
export interface Unit {
  name: string;
  factor: number;
}
export interface Product {
  id: string;
  name: string;
  baseUnit: BaseUnit;
  units: Unit[];
}
export interface InputAmount {
  quantity: number;
  unit: string;
  factor: number;
}
export interface Purchase extends InputAmount {
  id: string;
  productId: string;
  date: string;
  baseQuantity: number;
  price: number;
}
export interface Allocation {
  purchaseId: string;
  quantity: number;
  cost: number;
}
export interface Usage extends InputAmount {
  productId: string;
  baseQuantity: number;
  allocations: Allocation[];
}
export interface Meal {
  id: string;
  date: string;
  kind: string;
  usages: Usage[];
}
export interface State {
  version: 1;
  products: Product[];
  purchases: Purchase[];
  meals: Meal[];
}
export const emptyState = (): State => ({
  version: 1,
  products: [],
  purchases: [],
  meals: [],
});
export const baseUnits: BaseUnit[] = ["g", "ml", "個"];
export const mealKinds = ["朝食", "昼食", "夕食", "その他"];
export const standardUnits = (base: BaseUnit): Unit[] =>
  base === "g"
    ? [
        { name: "g", factor: 1 },
        { name: "kg", factor: 1000 },
      ]
    : base === "ml"
      ? [
          { name: "ml", factor: 1 },
          { name: "L", factor: 1000 },
        ]
      : [{ name: "個", factor: 1 }];
export const unitsFor = (product: Product) => [
  ...standardUnits(product.baseUnit),
  ...product.units,
];
const requireValue = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message);
};
export function validDate(date: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    Number.isFinite(Date.parse(date)) &&
    new Date(date).toISOString().slice(0, 10) === date
  );
}
// Base quantities are stored in thousandths (1g = 1000). Never use floats for allocation.
export function toBase(quantity: number, factor: number): number {
  requireValue(
    Number.isFinite(quantity) &&
      quantity > 0 &&
      Number.isFinite(factor) &&
      factor > 0,
    "数量と換算係数は正の数で入力してください",
  );
  const scaled = quantity * factor * 1000;
  requireValue(
    Number.isFinite(scaled) &&
      scaled > 0 &&
      Number.isSafeInteger(Math.round(scaled)) &&
      Math.abs(scaled - Math.round(scaled)) < 0.00001,
    "数量は基準単位の0.001以上、0.001刻みで入力してください",
  );
  return Math.round(scaled);
}
export function createProduct(
  name: string,
  baseUnit: BaseUnit,
  units: Unit[] = [],
): Product {
  requireValue(
    name.trim().length > 0 && name.trim().length <= 100,
    "食材名を100文字以内で入力してください",
  );
  requireValue(baseUnits.includes(baseUnit), "基準単位を選択してください");
  const names = new Set(standardUnits(baseUnit).map((u) => u.name));
  for (const unit of units) {
    requireValue(
      unit.name.trim().length > 0 &&
        unit.name.trim().length <= 20 &&
        !names.has(unit.name.trim()),
      "単位名は重複しない20文字以内の名前にしてください",
    );
    toBase(1, unit.factor);
    names.add(unit.name.trim());
  }
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    baseUnit,
    units: units.map((u) => ({ ...u, name: u.name.trim() })),
  };
}
function amount(
  state: State,
  productId: string,
  quantity: number,
  unitName: string,
) {
  const product = state.products.find((p) => p.id === productId);
  const unit = product && unitsFor(product).find((u) => u.name === unitName);
  requireValue(!!unit, "食材と単位を選択してください");
  return {
    productId,
    quantity,
    unit: unit!.name,
    factor: unit!.factor,
    baseQuantity: toBase(quantity, unit!.factor),
  };
}
export function recordPurchase(
  state: State,
  productId: string,
  quantity: number,
  unit: string,
  price: number,
  date: string,
): State {
  requireValue(validDate(date), "購入日を入力してください");
  requireValue(
    Number.isSafeInteger(price) && price >= 0 && price <= 100000000,
    "価格は0〜100,000,000円の整数で入力してください",
  );
  const purchase: Purchase = {
    id: crypto.randomUUID(),
    ...amount(state, productId, quantity, unit),
    date,
    price,
  };
  const next = { ...state, purchases: [...state.purchases, purchase] };
  requireValue(
    Number.isSafeInteger(stock(next, productId).quantity),
    "在庫量が上限を超えています",
  );
  return next;
}
export function consumed(state: State, purchaseId: string): number {
  return state.meals
    .flatMap((m) => m.usages)
    .flatMap((u) => u.allocations)
    .filter((a) => a.purchaseId === purchaseId)
    .reduce((sum, a) => sum + a.quantity, 0);
}
// Cumulative rounding makes the cost of consuming an entire lot equal its purchase price.
export function cumulativeCost(purchase: Purchase, used: number): number {
  const numerator = BigInt(purchase.price) * BigInt(used);
  const denominator = BigInt(purchase.baseQuantity);
  return Number((numerator * 2n + denominator) / (denominator * 2n));
}
export function stock(state: State, productId: string) {
  return state.purchases
    .filter((p) => p.productId === productId)
    .reduce(
      (total, p) => {
        const used = consumed(state, p.id);
        return {
          quantity: total.quantity + p.baseQuantity - used,
          value: total.value + p.price - cumulativeCost(p, used),
        };
      },
      { quantity: 0, value: 0 },
    );
}
export interface MealInput {
  productId: string;
  quantity: number;
  unit: string;
}
export function recordMeal(
  state: State,
  date: string,
  kind: string,
  inputs: MealInput[],
): State {
  requireValue(validDate(date), "食事の日付を入力してください");
  requireValue(mealKinds.includes(kind), "食事の種類を選択してください");
  requireValue(inputs.length > 0, "使った食材を追加してください");
  requireValue(
    new Set(inputs.map((i) => i.productId)).size === inputs.length,
    "同じ食材は1行にまとめてください",
  );
  const usages = inputs.map((input) => {
    const normalized = amount(
      state,
      input.productId,
      input.quantity,
      input.unit,
    );
    let needed = normalized.baseQuantity;
    const allocations: Allocation[] = [];
    // Same-day lots retain insertion order. Future purchases cannot fund a past meal.
    const purchases = state.purchases
      .filter((p) => p.productId === input.productId && p.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const purchase of purchases) {
      const used = consumed(state, purchase.id);
      const take = Math.min(needed, purchase.baseQuantity - used);
      if (take > 0)
        allocations.push({
          purchaseId: purchase.id,
          quantity: take,
          cost:
            cumulativeCost(purchase, used + take) -
            cumulativeCost(purchase, used),
        });
      needed -= take;
      if (needed === 0) break;
    }
    requireValue(
      needed === 0,
      `${state.products.find((p) => p.id === input.productId)?.name ?? "食材"}の在庫が不足しています（食事の日付までの購入分）`,
    );
    return { ...normalized, allocations };
  });
  return {
    ...state,
    meals: [...state.meals, { id: crypto.randomUUID(), date, kind, usages }],
  };
}
export const mealCost = (meal: Meal) =>
  meal.usages.flatMap((u) => u.allocations).reduce((sum, a) => sum + a.cost, 0);
export function dailyCosts(state: State) {
  const days = new Map<string, number>();
  for (const meal of state.meals)
    days.set(meal.date, (days.get(meal.date) ?? 0) + mealCost(meal));
  return [...days].sort(([a], [b]) => b.localeCompare(a));
}
