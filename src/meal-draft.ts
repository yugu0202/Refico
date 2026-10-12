import { unitsFor, toBase, type State } from "./domain/inventory.ts";
import type { Draft } from "./components/UsedItems.tsx";

export interface CookingDraft {
  key: string;
  name: string;
  servings: string;
  eatenServings: string;
  rows: Draft[];
}

export const cookingInput = (draft: CookingDraft) => ({
  name: draft.name,
  servings: Number(draft.servings),
  eatenServings: Number(draft.eatenServings),
  inputs: draft.rows.map((r) => ({
    productId: r.productId,
    quantity: Number(r.quantity),
    unit: r.unit,
  })),
});

// An ingredient can be used in both a draft cooking and the rest of the meal.
// Undo grouping merges those amounts at the ledger's base-unit precision.
export function restoreCookingRows(
  state: State,
  rows: Draft[],
  cooking: CookingDraft,
): Draft[] {
  const restored = rows.map((r) => ({ ...r }));
  for (const row of cooking.rows) {
    const existing = restored.find((r) => r.productId === row.productId);
    if (!existing) {
      restored.push({ ...row });
      continue;
    }
    const product = state.products.find((p) => p.id === row.productId);
    if (!product) throw new Error("食材が見つかりません");
    const amount = (r: Draft) => {
      const unit = unitsFor(product).find((u) => u.name === r.unit);
      if (!unit) throw new Error("食材の単位を確認してください");
      return toBase(Number(r.quantity), unit.factor);
    };
    existing.quantity = String((amount(existing) + amount(row)) / 1000);
    existing.unit = product.baseUnit;
  }
  return restored;
}
