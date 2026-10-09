import type { State } from "./inventory.ts";

interface SequenceChange<T> {
  start: number;
  deleteCount: number;
  items: T[];
}
interface CollectionChange<T> {
  upserts: T[];
  removals: string[];
  order?: SequenceChange<string>;
}
export interface StateChanges {
  products?: CollectionChange<State["products"][number]>;
  purchases?: CollectionChange<State["purchases"][number]>;
  meals?: CollectionChange<State["meals"][number]>;
  cookings?: CollectionChange<State["cookings"][number]>;
  adjustments?: CollectionChange<NonNullable<State["adjustments"]>[number]>;
  preparedAdjustments?: CollectionChange<
    NonNullable<State["preparedAdjustments"]>[number]
  >;
  recordOrder?: SequenceChange<string>;
}
export interface DeltaSnapshot {
  revision: number;
  baseRevision: number;
  changes: StateChanges;
}
function sequenceChange<T>(
  before: T[],
  after: T[],
): SequenceChange<T> | undefined {
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    ++start;
  let end = 0;
  while (
    end < before.length - start &&
    end < after.length - start &&
    before[before.length - 1 - end] === after[after.length - 1 - end]
  )
    ++end;
  if (start === before.length && start === after.length) return undefined;
  return {
    start,
    deleteCount: before.length - start - end,
    items: after.slice(start, after.length - end),
  };
}
function collectionChange<T extends { id: string }>(
  before: T[],
  after: T[],
): CollectionChange<T> | undefined {
  const old = new Map(before.map((r) => [r.id, JSON.stringify(r)]));
  const ids = new Set(after.map((r) => r.id));
  const upserts = after.filter((r) => old.get(r.id) !== JSON.stringify(r));
  const removals = before.filter((r) => !ids.has(r.id)).map((r) => r.id);
  const order = sequenceChange(
    before.map((r) => r.id),
    after.map((r) => r.id),
  );
  if (!upserts.length && !removals.length && !order) return undefined;
  return { upserts, removals, ...(order ? { order } : {}) };
}
export function diffState(before: State, after: State): StateChanges {
  return {
    products: collectionChange(before.products, after.products),
    purchases: collectionChange(before.purchases, after.purchases),
    meals: collectionChange(before.meals, after.meals),
    cookings: collectionChange(before.cookings, after.cookings),
    adjustments: collectionChange(
      before.adjustments ?? [],
      after.adjustments ?? [],
    ),
    preparedAdjustments: collectionChange(
      before.preparedAdjustments ?? [],
      after.preparedAdjustments ?? [],
    ),
    recordOrder: sequenceChange(before.recordOrder, after.recordOrder),
  };
}
function applySequence<T>(before: T[], change: SequenceChange<T>): T[] {
  return [
    ...before.slice(0, change.start),
    ...change.items,
    ...before.slice(change.start + change.deleteCount),
  ];
}
function applyCollection<T extends { id: string }>(
  before: T[],
  change?: CollectionChange<T>,
): T[] {
  if (!change) return before;
  const records = new Map(before.map((r) => [r.id, r]));
  for (const id of change.removals) records.delete(id);
  for (const record of change.upserts) records.set(record.id, record);
  const order = change.order
    ? applySequence(
        before.map((r) => r.id),
        change.order,
      )
    : before.map((r) => r.id);
  if (
    order.length !== records.size ||
    new Set(order).size !== order.length ||
    order.some((id) => !records.has(id))
  )
    throw new Error("更新データを確認できませんでした。再読み込みしてください");
  return order.map((id) => records.get(id)!);
}
export function applyStateChanges(state: State, changes: StateChanges): State {
  return {
    ...state,
    products: applyCollection(state.products, changes.products),
    purchases: applyCollection(state.purchases, changes.purchases),
    meals: applyCollection(state.meals, changes.meals),
    cookings: applyCollection(state.cookings, changes.cookings),
    ...(changes.adjustments
      ? {
          adjustments: applyCollection(
            state.adjustments ?? [],
            changes.adjustments,
          ),
        }
      : {}),
    ...(changes.preparedAdjustments
      ? {
          preparedAdjustments: applyCollection(
            state.preparedAdjustments ?? [],
            changes.preparedAdjustments,
          ),
        }
      : {}),
    recordOrder: changes.recordOrder
      ? applySequence(state.recordOrder, changes.recordOrder)
      : state.recordOrder,
  };
}
