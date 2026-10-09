import { z } from "zod";
import {
  createProduct,
  recordPurchase,
  recordMeal,
  recordCooking,
  recordStockAdjustment,
  recordPreparedAdjustment,
  updatePreparedName,
  type State,
} from "./inventory.ts";
import {
  updateProductInventory,
  updateCookingInventory,
} from "./inventory-edit.ts";
import {
  updateMeal,
  updatePurchase,
  deleteMeal,
  deletePurchase,
  deleteCooking,
} from "./history.ts";
import { sampleState } from "./sample.ts";
const id = z.string().min(1).max(100);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const positive = z.number().finite().positive().max(1e9);
const unit = z
  .object({ name: z.string().trim().min(1).max(20), factor: positive })
  .strict();
const purchase = z
  .object({
    productId: id,
    quantity: positive,
    unit: z.string().min(1).max(20),
    price: z.number().int().min(0).max(100000000),
    date,
  })
  .strict();
const directCost = z
  .object({
    cost: z.number().int().min(0).max(100000000),
    place: z.string().trim().max(100),
    note: z.string().trim().max(500),
  })
  .strict();
const inventoryMeal = z
  .object({
    source: z.literal("inventory").optional(),
    date,
    kind: z.enum(["朝食", "昼食", "夕食", "その他"]),
    inputs: z
      .array(
        z
          .object({
            productId: id,
            quantity: positive,
            unit: z.string().min(1).max(20),
          })
          .strict(),
      )
      .max(100),
    prepared: z
      .array(z.object({ batchId: id, quantity: positive }).strict())
      .max(100),
    direct: directCost.optional(),
  })
  .strict();
const cooking = z
  .object({
    date,
    name: z.string().trim().min(1).max(100),
    servings: positive,
    inputs: inventoryMeal.shape.inputs,
  })
  .strict();
const adjustment = z
  .object({
    quantity: z.number().finite().min(0).max(1e9),
    date,
    reason: z.string().trim().max(200),
  })
  .strict();
const meal = z.union([
  inventoryMeal,
  z
    .object({
      source: z.literal("direct"),
      date,
      kind: z.enum(["朝食", "昼食", "夕食", "その他"]),
      ...directCost.shape,
    })
    .strict(),
]);
export const commandSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("product.create"),
      product: z
        .object({
          id,
          name: z.string().trim().min(1).max(100),
          baseUnit: z.enum(["g", "ml", "個"]),
          units: z.array(unit).max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      type: z.literal("product.update"),
      id,
      name: z.string().trim().min(1).max(100),
      units: z.array(unit).max(100),
      adjustment: adjustment.optional(),
    })
    .strict(),
  z.object({ type: z.literal("purchase.create"), input: purchase }).strict(),
  z
    .object({ type: z.literal("purchase.update"), id, input: purchase })
    .strict(),
  z.object({ type: z.literal("prepared.create"), input: cooking }).strict(),
  z
    .object({
      type: z.literal("prepared.update"),
      id,
      input: cooking,
      adjustment: adjustment.optional(),
    })
    .strict(),
  z.object({ type: z.literal("meal.create"), input: meal }).strict(),
  z.object({ type: z.literal("meal.update"), id, input: meal }).strict(),
  z.object({ type: z.literal("purchase.delete"), id }).strict(),
  z.object({ type: z.literal("meal.delete"), id }).strict(),
  z.object({ type: z.literal("prepared.delete"), id }).strict(),
  z
    .object({
      type: z.literal("stock.adjust"),
      id,
      prepared: z.boolean(),
      quantity: z.number().finite().min(0).max(1e9),
      date,
      reason: z.string().trim().max(200),
    })
    .strict(),
  z
    .object({
      type: z.literal("prepared.rename"),
      id,
      name: z.string().trim().min(1).max(100),
    })
    .strict(),
  z.object({ type: z.literal("sample.create"), date }).strict(),
]);
export type Command = z.infer<typeof commandSchema>;
export const mutationSchema = z
  .object({
    requestId: z.uuid(),
    revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
    command: commandSchema,
  })
  .strict();
export function applyCommand(state: State, command: Command): State {
  switch (command.type) {
    case "purchase.delete":
      return deletePurchase(state, command.id);
    case "meal.delete":
      return deleteMeal(state, command.id);
    case "prepared.delete":
      return deleteCooking(state, command.id);
    case "product.create": {
      if (
        state.products.some(
          (p) => p.id === command.product.id || p.name === command.product.name,
        )
      )
        throw new Error("同じ食材が登録されています");
      const p = createProduct(
        command.product.name,
        command.product.baseUnit,
        command.product.units,
      );
      return {
        ...state,
        products: [...state.products, { ...p, id: command.product.id }],
      };
    }
    case "product.update": {
      if (
        state.products.some(
          (p) => p.id !== command.id && p.name === command.name,
        )
      )
        throw new Error("同じ名前の食材が登録されています");
      // Settings and the measured remainder share one revision/receipt and save.
      return updateProductInventory(
        state,
        command.id,
        command.name,
        command.units,
        command.adjustment,
      );
    }
    case "purchase.create": {
      const p = command.input;
      return recordPurchase(
        state,
        p.productId,
        p.quantity,
        p.unit,
        p.price,
        p.date,
      );
    }
    case "purchase.update":
      return updatePurchase(state, command.id, command.input);
    case "prepared.create": {
      const c = command.input;
      return recordCooking(state, c.date, c.name, c.servings, c.inputs);
    }
    case "prepared.update":
      return updateCookingInventory(
        state,
        command.id,
        command.input,
        command.adjustment,
      );
    case "meal.create": {
      const m = command.input;
      return m.source === "direct"
        ? recordMeal(state, m.date, m.kind, [], [], {
            cost: m.cost,
            place: m.place,
            note: m.note,
          })
        : recordMeal(state, m.date, m.kind, m.inputs, m.prepared, m.direct);
    }
    case "meal.update": {
      const m = command.input;
      if (m.source === "direct")
        return updateMeal(state, command.id, m.date, m.kind, [], [], {
          cost: m.cost,
          place: m.place,
          note: m.note,
        });
      return updateMeal(
        state,
        command.id,
        m.date,
        m.kind,
        m.inputs,
        m.prepared,
        m.direct,
      );
    }
    case "stock.adjust":
      return command.prepared
        ? recordPreparedAdjustment(
            state,
            command.id,
            command.quantity,
            command.date,
            command.reason,
          )
        : recordStockAdjustment(
            state,
            command.id,
            command.quantity,
            command.date,
            command.reason,
          );
    case "prepared.rename":
      return updatePreparedName(state, command.id, command.name);
    case "sample.create":
      if (
        state.products.length ||
        state.meals.length ||
        state.cookings.length ||
        state.purchases.length
      )
        throw new Error("サンプルは空の状態でのみ追加できます");
      return sampleState(command.date);
  }
}
