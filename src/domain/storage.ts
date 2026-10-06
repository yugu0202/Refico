import {
  emptyState,
  type State,
  validDate,
  toBase,
  baseUnits,
  unitsFor,
  mealKinds,
  cumulativeCost,
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
  const totals = new Map<string, { quantity: number; cost: number }>();
  for (const meal of state.meals) {
    id(meal.id);
    check(
      validDate(meal.date) &&
        mealKinds.includes(meal.kind) &&
        Array.isArray(meal.usages) &&
        meal.usages.length > 0,
    );
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
  return state;
}
export function loadState(): State {
  const raw = localStorage.getItem(KEY);
  return raw ? parseState(raw) : emptyState();
}
export function saveState(state: State): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
