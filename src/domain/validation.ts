import { parseState as parseLedger } from "./ledger-validation.ts";
import { fromLedger, toLedger, type State } from "./inventory.ts";
export function parseState(raw: string): State {
  const state: State = JSON.parse(raw);
  if (
    !Array.isArray(state.cookings) ||
    !Array.isArray(state.meals) ||
    !Array.isArray(state.recordOrder) ||
    state.meals.some((m) => "batch" in m)
  )
    throw new Error("保存データを読み込めません");
  return fromLedger(parseLedger(JSON.stringify(toLedger(state))));
}
