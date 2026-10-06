import {
  createProduct,
  emptyState,
  recordMeal,
  recordPurchase,
} from "./inventory.ts";
export function sampleState(date: string) {
  const rice = createProduct("白米", "g", [{ name: "合", factor: 150 }]);
  const eggs = createProduct("卵", "個", [{ name: "パック", factor: 10 }]);
  const chicken = createProduct("鶏もも肉", "g");
  let state = { ...emptyState(), products: [rice, eggs, chicken] };
  state = recordPurchase(state, rice.id, 5, "kg", 4000, date);
  state = recordPurchase(state, eggs.id, 1, "パック", 300, date);
  state = recordPurchase(state, chicken.id, 800, "g", 780, date);
  state = recordMeal(state, date, "朝食", [
    { productId: rice.id, quantity: 1, unit: "合" },
    { productId: eggs.id, quantity: 2, unit: "個" },
  ]);
  return state;
}
