import { fromLedger, toLedger, type State } from "./inventory.ts";
import {
  emptyState,
  cookingCost,
  portionCost,
  toBase,
  type State as LedgerState,
  type BaseUnit,
  type InputAmount,
  type Usage,
  type Meal,
} from "./ledger.ts";
// These are the server's persistent records. State is a calculation/UI projection;
// array positions and synthetic purchases never cross the persistence boundary.
type Ordered = { id: string; sequence: number };
type Amount = InputAmount & { baseQuantity: number };
export interface Model {
  products: { id: string; name: string; baseUnit: BaseUnit }[];
  units: {
    id: string;
    productId: string;
    name: string;
    factor: number;
    position: number;
  }[];
  purchases: (Ordered &
    Amount & {
      productId: string;
      date: string;
      price: number;
      lotId: string;
    })[];
  lots: (Ordered &
    Amount & {
      productId: string;
      date: string;
      value: number;
      sourceType: "purchase" | "adjustment";
      sourceId: string;
    })[];
  cookings: (Ordered & { date: string; batchId: string; kind: string })[];
  batches: {
    id: string;
    cookingId: string;
    name: string;
    quantity: number;
    value: number;
  }[];
  meals: (Ordered & {
    date: string;
    kind: string;
    cookingId?: string;
    direct?: Meal["direct"];
  })[];
  usages: (Amount & {
    id: string;
    ownerType: "meal" | "cooking";
    ownerId: string;
    productId: string;
  })[];
  portions: {
    id: string;
    mealId: string;
    batchId: string;
    quantity: number;
    cost: number;
  }[];
  allocations: {
    id: string;
    ownerType: "usage" | "adjustment";
    ownerId: string;
    lotId: string;
    quantity: number;
    cost: number;
  }[];
  adjustments: (Ordered & {
    productId: string;
    date: string;
    reason: string;
    beforeQuantity: number;
    targetQuantity: number;
    addedLotId?: string;
    sourceLotId?: string;
  })[];
  discards: (Ordered & {
    batchId: string;
    date: string;
    reason: string;
    beforeQuantity: number;
    targetQuantity: number;
    beforeValue: number;
    targetValue: number;
  })[];
}
export const modelTables = [
  "products",
  "units",
  "purchases",
  "lots",
  "cookings",
  "batches",
  "meals",
  "usages",
  "portions",
  "allocations",
  "adjustments",
  "discards",
] as const;
export function emptyModel(): Model {
  return Object.fromEntries(
    modelTables.map((t) => [t, []]),
  ) as unknown as Model;
}
function ledgerToModel(state: LedgerState, prior = emptyModel()): Model {
  const model = emptyModel();
  const sequences = new Map(
    [
      ...prior.purchases,
      ...prior.cookings,
      ...prior.meals,
      ...prior.adjustments,
      ...prior.discards,
    ].map((r) => [r.id, r.sequence]),
  );
  let counter = [...sequences.values()].reduce((a, b) => Math.max(a, b), 0);
  const sequence = (id: string) => {
    if (!sequences.has(id)) sequences.set(id, ++counter);
    return sequences.get(id)!;
  };
  model.products = state.products.map(({ id, name, baseUnit }) => ({
    id,
    name,
    baseUnit,
  }));
  model.units = state.products.flatMap((p) =>
    p.units.map((u, position) => ({
      ...u,
      position,
      id:
        prior.units.find((v) => v.productId === p.id && v.name === u.name)
          ?.id ?? `${p.id}:unit:${crypto.randomUUID()}`,
      productId: p.id,
    })),
  );
  // New input contains at most one record, except the explicitly requested sample.
  // Existing recording order is preserved by stable sequences across edits.
  for (const p of state.purchases) {
    const seq = p.adjustmentId ? sequence(p.adjustmentId) : sequence(p.id);
    const { id, productId, date, quantity, unit, factor, baseQuantity, price } =
      p;
    model.lots.push({
      id,
      sequence: seq,
      productId,
      date,
      quantity,
      unit,
      factor,
      baseQuantity,
      value: price,
      sourceType: p.adjustmentId ? "adjustment" : "purchase",
      sourceId: p.adjustmentId ?? id,
    });
    if (!p.adjustmentId)
      model.purchases.push({
        id,
        sequence: seq,
        productId,
        date,
        quantity,
        unit,
        factor,
        baseQuantity,
        price,
        lotId: id,
      });
  }
  const allocate = (
    ownerType: "usage" | "adjustment",
    ownerId: string,
    allocations: Usage["allocations"],
  ) =>
    allocations.forEach((a, i) =>
      model.allocations.push({
        id: `${ownerId}:allocation:${i}`,
        ownerType,
        ownerId,
        lotId: a.purchaseId,
        quantity: a.quantity,
        cost: a.cost,
      }),
    );
  for (const m of state.meals) {
    const seq = sequence(m.id);
    const mealId = m.batch ? `${m.id}:meal` : m.id;
    if (m.batch) {
      model.cookings.push({
        id: m.id,
        sequence: seq,
        date: m.date,
        batchId: m.id,
        kind: m.kind,
      });
      model.batches.push({
        id: m.id,
        cookingId: m.id,
        name: m.batch.name,
        quantity: toBase(m.batch.servings, 1),
        value: cookingCost(m),
      });
    }
    // A cooking with no immediate consumption is not a meal record.
    if (!m.batch || m.batch.eatenServings > 0) {
      model.meals.push({
        id: mealId,
        sequence: seq,
        date: m.date,
        kind: m.kind,
        ...(m.batch ? { cookingId: m.id } : {}),
        ...(m.direct ? { direct: m.direct } : {}),
      });
      if (m.batch)
        model.portions.push({
          id: `${mealId}:portion:${m.id}`,
          mealId,
          batchId: m.id,
          quantity: Math.round(m.batch.eatenServings * 1000),
          cost: portionCost(m, Math.round(m.batch.eatenServings * 1000)),
        });
    }
    for (const u of m.usages) {
      const id = `${m.id}:usage:${u.productId}`;
      const { allocations, ...amount } = u;
      model.usages.push({
        ...amount,
        id,
        ownerType: m.batch ? "cooking" : "meal",
        ownerId: m.batch ? m.id : mealId,
      });
      allocate("usage", id, allocations);
    }
    for (const p of m.prepared ?? [])
      model.portions.push({
        id: `${mealId}:portion:${p.batchId}`,
        mealId,
        batchId: p.batchId,
        quantity: toBase(p.quantity, 1),
        cost: p.cost,
      });
  }
  model.adjustments = (state.adjustments ?? []).map((a) => {
    allocate("adjustment", a.id, a.allocations);
    return {
      id: a.id,
      sequence: sequence(a.id),
      productId: a.productId,
      date: a.date,
      reason: a.reason,
      beforeQuantity: a.beforeQuantity,
      targetQuantity: a.targetQuantity,
      addedLotId: a.addedPurchaseId,
      sourceLotId: a.sourcePurchaseId,
    };
  });
  model.discards = (state.preparedAdjustments ?? []).map(
    ({ mealCount, ...a }) => ({ ...a, sequence: sequence(a.id) }),
  );
  return model;
}
function modelToLedger(model: Model): LedgerState {
  const state = emptyState();
  state.products = model.products.map((p) => ({
    ...p,
    units: model.units
      .filter((u) => u.productId === p.id)
      .sort((a, b) => a.position - b.position)
      .map(({ name, factor }) => ({ name, factor })),
  }));
  state.purchases = [...model.lots]
    .sort((a, b) => a.sequence - b.sequence)
    .map((l) => ({
      id: l.id,
      productId: l.productId,
      date: l.date,
      quantity: l.quantity,
      unit: l.unit,
      factor: l.factor,
      baseQuantity: l.baseQuantity,
      price: l.value,
      ...(l.sourceType === "adjustment" ? { adjustmentId: l.sourceId } : {}),
    }));
  const allocation = (type: "usage" | "adjustment", id: string) =>
    model.allocations
      .filter((a) => a.ownerType === type && a.ownerId === id)
      .map((a) => ({
        purchaseId: a.lotId,
        quantity: a.quantity,
        cost: a.cost,
      }));
  const usages = (type: "meal" | "cooking", id: string) =>
    model.usages
      .filter((u) => u.ownerType === type && u.ownerId === id)
      .map(({ id, ownerType, ownerId, ...u }) => ({
        ...u,
        allocations: allocation("usage", id),
      }));
  const viewMeals: (Meal & { sequence: number })[] = model.cookings.map((c) => {
    const b = model.batches.find((b) => b.id === c.batchId)!;
    const immediate = model.meals.find((m) => m.cookingId === c.id);
    const p =
      immediate &&
      model.portions.find(
        (p) => p.mealId === immediate.id && p.batchId === b.id,
      );
    return {
      id: c.id,
      date: c.date,
      kind: c.kind,
      sequence: c.sequence,
      usages: usages("cooking", c.id),
      batch: {
        name: b.name,
        servings: b.quantity / 1000,
        eatenServings: (p ? p.quantity : 0) / 1000,
      },
    };
  });
  viewMeals.push(
    ...model.meals
      .filter((m) => !m.cookingId)
      .map((m) => ({
        id: m.id,
        date: m.date,
        kind: m.kind,
        sequence: m.sequence,
        usages: usages("meal", m.id),
        ...(m.direct ? { direct: m.direct } : {}),
        prepared: model.portions
          .filter((p) => p.mealId === m.id)
          .map((p) => ({
            batchId: p.batchId,
            quantity: p.quantity / 1000,
            cost: p.cost,
          })),
      })),
  );
  viewMeals.sort((a, b) => a.sequence - b.sequence);
  state.meals = viewMeals.map(({ sequence, ...m }) => m);
  state.adjustments = [...model.adjustments]
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ sequence, addedLotId, sourceLotId, ...a }) => ({
      ...a,
      addedPurchaseId: addedLotId,
      sourcePurchaseId: sourceLotId,
      allocations: allocation("adjustment", a.id),
      mealCount: viewMeals.filter((m) => m.sequence < sequence).length,
      purchaseCount: model.lots.filter((l) => l.sequence < sequence).length,
    }));
  state.preparedAdjustments = [...model.discards]
    .sort((a, b) => a.sequence - b.sequence)
    .map(({ sequence, ...a }) => ({
      ...a,
      mealCount: viewMeals.filter((m) => m.sequence < sequence).length,
    }));
  return state;
}

// The persisted schema already separates cooking and eating. The public view
// does too; the private ledger only preserves the proven allocation/replay engine.
export function toView(model: Model): State {
  return fromLedger(modelToLedger(model));
}
export function toModel(state: State, prior = emptyModel()): Model {
  const model = ledgerToModel(toLedger(state), prior);
  for (const cooking of model.cookings)
    cooking.kind =
      prior.cookings.find((c) => c.id === cooking.id)?.kind ?? "その他";
  return model;
}
