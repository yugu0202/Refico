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
    throw new Error("記録を読み込めませんでした。再読み込みしても解消しない場合は、データの確認が必要です。");
  return fromLedger(parseLedger(JSON.stringify(toLedger(state))));
}
