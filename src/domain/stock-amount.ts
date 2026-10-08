import { standardUnits, type BaseUnit, type Unit } from "./inventory.ts";

export function stockDisplayUnit(base: BaseUnit, quantity: number): Unit {
  const units = standardUnits(base);
  return units.find((u) => u.factor === 1000 && quantity >= 1000) ?? units[0];
}

// Remove floating-point noise only at the ledger's existing 0.001 precision.
// Finer quantities stay unrounded so domain validation can reject them.
export function stockQuantity(quantity: string, unit: Unit): number {
  if (!quantity.trim()) return NaN;
  const value = Number(quantity) * unit.factor;
  const scaled = value * 1000;
  return Number.isFinite(scaled) &&
    Math.abs(scaled - Math.round(scaled)) < 0.00001
    ? Math.round(scaled) / 1000
    : value;
}

export function convertStockQuantity(
  quantity: string,
  from: Unit,
  to: Unit,
): string {
  if (!quantity.trim()) return quantity;
  const value = stockQuantity(quantity, from) / to.factor;
  return Number.isFinite(value) ? String(value) : quantity;
}
