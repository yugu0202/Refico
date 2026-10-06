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
  adjustmentId?: string;
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
  batch?: { name: string; servings: number; eatenServings: number };
  prepared?: { batchId: string; quantity: number; cost: number }[];
}
export interface StockAdjustment {
  id: string;
  productId: string;
  date: string;
  reason: string;
  beforeQuantity: number;
  targetQuantity: number;
  allocations: Allocation[];
  addedPurchaseId?: string;
  sourcePurchaseId?: string;
  // Positions preserve recording order, even for backdated meals and purchases.
  mealCount: number;
  purchaseCount: number;
}
export interface State {
  version: 1;
  products: Product[];
  purchases: Purchase[];
  meals: Meal[];
  adjustments?: StockAdjustment[];
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
  validateProductName(name);
  requireValue(baseUnits.includes(baseUnit), "基準単位を選択してください");
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    baseUnit,
    units: validateUnits(baseUnit, units),
  };
}
function validateProductName(name: string) {
  requireValue(
    name.trim().length > 0 && name.trim().length <= 100,
    "食材名を100文字以内で入力してください",
  );
}
function validateUnits(baseUnit: BaseUnit, units: Unit[]): Unit[] {
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
  return units.map((u) => ({ ...u, name: u.name.trim() }));
}
export function updateProductUnits(
  state: State,
  productId: string,
  units: Unit[],
): State {
  const product = state.products.find((p) => p.id === productId);
  requireValue(!!product, "食材が見つかりません");
  return updateProduct(state, productId, product!.name, units);
}
export function updateProduct(
  state: State,
  productId: string,
  name: string,
  units: Unit[],
): State {
  const product = state.products.find((p) => p.id === productId);
  requireValue(!!product, "食材が見つかりません");
  validateProductName(name);
  requireValue(
    !state.products.some((p) => p.id !== productId && p.name === name.trim()),
    "同じ名前の食材が登録されています",
  );
  const validated = validateUnits(product!.baseUnit, units);
  // Historical quantities, factors, and allocations remain snapshots of the original input.
  return {
    ...state,
    products: state.products.map((p) =>
      p.id === productId ? { ...p, name: name.trim(), units: validated } : p,
    ),
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
  return [
    ...state.meals.flatMap((m) => m.usages).flatMap((u) => u.allocations),
    ...(state.adjustments ?? []).flatMap((a) => a.allocations),
  ]
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
  batch?: Meal["batch"],
  preparedInputs: { batchId: string; quantity: number }[] = [],
): State {
  requireValue(validDate(date), "食事の日付を入力してください");
  requireValue(mealKinds.includes(kind), "食事の種類を選択してください");
  requireValue(
    inputs.length > 0 || preparedInputs.length > 0,
    "食材か作り置きを追加してください",
  );
  if (batch) {
    requireValue(
      inputs.length > 0 && preparedInputs.length === 0,
      "作り置きには食材を追加してください",
    );
    requireValue(
      typeof batch.name === "string" &&
        batch.name.trim().length > 0 &&
        batch.name.trim().length <= 100,
      "料理名を100文字以内で入力してください",
    );
    toBase(batch.servings, 1);
    requireValue(
      Number.isFinite(batch.eatenServings) &&
        batch.eatenServings >= 0 &&
        batch.eatenServings < batch.servings,
      "今回食べた量は0以上、作った量未満で入力してください",
    );
    if (batch.eatenServings > 0) toBase(batch.eatenServings, 1);
  }
  requireValue(
    new Set(preparedInputs.map((i) => i.batchId)).size ===
      preparedInputs.length,
    "同じ作り置きは1行にまとめてください",
  );
  const prepared = preparedInputs.map((input) => {
    const source = state.meals.find((m) => m.id === input.batchId);
    requireValue(
      !!source?.batch && source.date <= date,
      "食事の日付までの作り置きを選択してください",
    );
    const used = preparedConsumed(state, source!);
    const quantity = toBase(input.quantity, 1);
    requireValue(
      used + quantity <= toBase(source!.batch!.servings, 1),
      "作り置きの残量が不足しています",
    );
    return {
      ...input,
      cost: portionCost(source!, used + quantity) - portionCost(source!, used),
    };
  });
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
    meals: [
      ...state.meals,
      {
        id: crypto.randomUUID(),
        date,
        kind,
        usages,
        ...(batch ? { batch: { ...batch, name: batch.name.trim() } } : {}),
        ...(prepared.length ? { prepared } : {}),
      },
    ],
  };
}
export const cookingCost = (meal: Meal) =>
  meal.usages.flatMap((u) => u.allocations).reduce((sum, a) => sum + a.cost, 0);
// Allocate yen by cumulative rounding so all portions exactly match the cooking cost.
export function portionCost(meal: Meal, quantity: number): number {
  return cumulativeCost(
    {
      price: cookingCost(meal),
      baseQuantity: toBase(meal.batch!.servings, 1),
    } as Purchase,
    quantity,
  );
}
export function preparedConsumed(state: State, meal: Meal): number {
  return (
    (meal.batch!.eatenServings === 0
      ? 0
      : toBase(meal.batch!.eatenServings, 1)) +
    state.meals
      .flatMap((m) => m.prepared ?? [])
      .filter((p) => p.batchId === meal.id)
      .reduce((sum, p) => sum + toBase(p.quantity, 1), 0)
  );
}
export function preparedRemaining(state: State, meal: Meal): number {
  return (
    (toBase(meal.batch!.servings, 1) - preparedConsumed(state, meal)) / 1000
  );
}
export const mealCost = (meal: Meal) =>
  (meal.batch
    ? portionCost(meal, Math.round(meal.batch.eatenServings * 1000))
    : cookingCost(meal)) +
  (meal.prepared ?? []).reduce((sum, p) => sum + p.cost, 0);
export function dailyCosts(state: State) {
  const days = new Map<string, number>();
  for (const meal of state.meals) {
    if (meal.batch && meal.batch.eatenServings === 0) continue;
    days.set(meal.date, (days.get(meal.date) ?? 0) + mealCost(meal));
  }
  return [...days].sort(([a], [b]) => b.localeCompare(a));
}

// Synthetic adjustment lots participate in FIFO, but never represent purchases.
export function latestPurchase(state: State, productId: string, date?: string) {
  return [...state.purchases]
    .reverse()
    .filter(
      (p) =>
        p.productId === productId &&
        !p.adjustmentId &&
        (!date || p.date <= date),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .at(0);
}
export function recordStockAdjustment(
  state: State,
  productId: string,
  quantity: number,
  date: string,
  reason = "",
): State {
  const product = state.products.find((p) => p.id === productId);
  requireValue(!!product, "食材が見つかりません");
  requireValue(validDate(date), "調整日を入力してください");
  requireValue(
    typeof reason === "string" && reason.trim().length <= 200,
    "理由は200文字以内で入力してください",
  );
  requireValue(
    Number.isFinite(quantity) && quantity >= 0,
    "残量は0以上で入力してください",
  );
  const targetQuantity = quantity === 0 ? 0 : toBase(quantity, 1);
  const beforeQuantity = stock(state, productId).quantity;
  const difference = targetQuantity - beforeQuantity;
  requireValue(difference !== 0, "残量を変更してください");
  const adjustment: StockAdjustment = {
    id: crypto.randomUUID(),
    productId,
    date,
    reason: reason.trim(),
    beforeQuantity,
    targetQuantity,
    allocations: [],
    mealCount: state.meals.length,
    purchaseCount: state.purchases.length,
  };
  let purchases = state.purchases;
  if (difference > 0) {
    const source = latestPurchase(state, productId, date);
    requireValue(!!source, "単価を計算できません。先に購入を記録してください");
    const price = cumulativeCost(source!, difference);
    requireValue(
      Number.isSafeInteger(price) && price <= 100000000,
      "調整金額が上限を超えています",
    );
    const lot: Purchase = {
      id: crypto.randomUUID(),
      productId,
      date,
      quantity: difference / 1000,
      unit: product!.baseUnit,
      factor: 1,
      baseQuantity: difference,
      price,
      adjustmentId: adjustment.id,
    };
    purchases = [...purchases, lot];
    adjustment.addedPurchaseId = lot.id;
    adjustment.sourcePurchaseId = source!.id;
  } else {
    let needed = -difference;
    const lots = state.purchases
      .filter((p) => p.productId === productId && p.date <= date)
      .sort((a, b) => a.date.localeCompare(b.date));
    for (const lot of lots) {
      const used = consumed(state, lot.id);
      const take = Math.min(needed, lot.baseQuantity - used);
      if (take > 0)
        adjustment.allocations.push({
          purchaseId: lot.id,
          quantity: take,
          cost: cumulativeCost(lot, used + take) - cumulativeCost(lot, used),
        });
      needed -= take;
      if (needed === 0) break;
    }
    requireValue(needed === 0, "調整日までの在庫が不足しています");
  }
  // Past meal allocations and costs are immutable; adjustments carry their own cost.
  return {
    ...state,
    purchases,
    adjustments: [...(state.adjustments ?? []), adjustment],
  };
}

export function updatePreparedName(
  state: State,
  batchId: string,
  name: string,
): State {
  const source = state.meals.find((meal) => meal.id === batchId);
  requireValue(!!source?.batch, "作り置きが見つかりません");
  requireValue(
    typeof name === "string" &&
      name.trim().length > 0 &&
      name.trim().length <= 100,
    "料理名を100文字以内で入力してください",
  );
  return {
    ...state,
    meals: state.meals.map((meal) =>
      meal.id === batchId
        ? { ...meal, batch: { ...meal.batch!, name: name.trim() } }
        : meal,
    ),
  };
}
