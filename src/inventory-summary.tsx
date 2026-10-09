import { createContext, useContext, useMemo } from "react";
import {
  summarizeInventory,
  type InventorySummary,
} from "./domain/inventory-summary";
import type { State } from "./domain/inventory";

export const InventorySummaryContext = createContext<InventorySummary | null>(
  null,
);
export function useInventorySummary(state: State) {
  const shared = useContext(InventorySummaryContext);
  return useMemo(
    () => (shared?.state === state ? shared : summarizeInventory(state)),
    [state, shared],
  );
}
