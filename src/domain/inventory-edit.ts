import {
  updateProduct,
  recordStockAdjustment,
  recordPreparedAdjustment,
  stock,
  preparedRemaining,
  type State,
  type Unit,
  type MealInput,
} from "./inventory.ts";
import { updateCooking } from "./history.ts";
export interface RemainingChange {
  quantity: number;
  date: string;
  reason: string;
}

export function updateProductInventory(
  state: State,
  id: string,
  name: string,
  units: Unit[],
  adjustment?: RemainingChange,
): State {
  const next = updateProduct(state, id, name, units);
  return adjustment && adjustment.quantity !== stock(next, id).quantity / 1000
    ? recordStockAdjustment(
        next,
        id,
        adjustment.quantity,
        adjustment.date,
        adjustment.reason,
      )
    : next;
}
export function updateCookingInventory(
  state: State,
  id: string,
  input: { date: string; name: string; servings: number; inputs: MealInput[] },
  adjustment?: RemainingChange,
): State {
  const next = updateCooking(
    state,
    id,
    input.date,
    input.name,
    input.servings,
    input.inputs,
  );
  return adjustment &&
    adjustment.quantity !==
      preparedRemaining(
        next,
        next.cookings.find((c) => c.id === id)!,
      )
    ? recordPreparedAdjustment(
        next,
        id,
        adjustment.quantity,
        adjustment.date,
        adjustment.reason,
      )
    : next;
}
