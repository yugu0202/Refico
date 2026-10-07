import { z } from "zod";
import {
  createProduct,
  recordPurchase,
  recordMeal,
  recordStockAdjustment,
  recordPreparedAdjustment,
  updateProduct,
  updatePreparedName,
  type State,
} from "./inventory.ts";
import { updateMeal, updatePurchase } from "./history.ts";
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
    batch: z
      .object({
        name: z.string().trim().min(1).max(100),
        servings: positive,
        eatenServings: z.number().finite().min(0).max(1e9),
      })
      .strict()
      .optional(),
    prepared: z
      .array(z.object({ batchId: id, quantity: positive }).strict())
      .max(100),
  })
  .strict();
const meal = z.union([
  inventoryMeal,
  z
    .object({
      source: z.literal("direct"),
      date,
      kind: z.enum(["朝食", "昼食", "夕食", "その他"]),
      cost: z.number().int().min(0).max(100000000),
      place: z.string().trim().max(100),
      note: z.string().trim().max(500),
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
    })
    .strict(),
  z.object({ type: z.literal("purchase.create"), input: purchase }).strict(),
  z
    .object({ type: z.literal("purchase.update"), id, input: purchase })
    .strict(),
  z.object({ type: z.literal("meal.create"), input: meal }).strict(),
  z.object({ type: z.literal("meal.update"), id, input: meal }).strict(),
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
    case "product.update":
      if (
        state.products.some(
          (p) => p.id !== command.id && p.name === command.name,
        )
      )
        throw new Error("同じ名前の食材が登録されています");
      return updateProduct(state, command.id, command.name, command.units);
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
    case "meal.create": {
      const m = command.input;
      return m.source === "direct"
        ? recordMeal(state, m.date, m.kind, [], undefined, [], [], {
            cost: m.cost,
            place: m.place,
            note: m.note,
          })
        : recordMeal(state, m.date, m.kind, m.inputs, m.batch, m.prepared);
    }
    case "meal.update": {
      const m = command.input;
      if (m.source === "direct")
        return updateMeal(
          state,
          command.id,
          m.date,
          m.kind,
          [],
          undefined,
          [],
          { cost: m.cost, place: m.place, note: m.note },
        );
      return updateMeal(
        state,
        command.id,
        m.date,
        m.kind,
        m.inputs,
        m.batch,
        m.prepared,
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
      if (state.products.length || state.meals.length || state.purchases.length)
        throw new Error("サンプルは空の状態でのみ追加できます");
      return sampleState(command.date);
  }
}
