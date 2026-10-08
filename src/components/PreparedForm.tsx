import { useState, useRef, type FormEvent } from "react";
import Button from "@mui/material/Button";
import InputAdornment from "@mui/material/InputAdornment";
import { RemainingFields } from "./RemainingFields";
import TextField from "@mui/material/TextField";
import { UsedItems, type Draft } from "./UsedItems";
import {
  cookingCost,
  recordCooking,
  stock,
  preparedRemaining,
  type Cooking,
  type State,
} from "../domain/inventory";
import { updateCooking } from "../domain/history";
import type { Command } from "../domain/commands";
import { updateCookingInventory } from "../domain/inventory-edit";
import { money } from "../format";
export function PreparedForm({
  state,
  today,
  editing,
  onSave,
  onCancel,
  onPurchase,
  autoFocus = true,
  showCost = true,
}: {
  state: State;
  today: string;
  editing?: Cooking;
  onSave: (command: Command) => Promise<void>;
  onCancel?: () => void;
  onPurchase?: () => void;
  autoFocus?: boolean;
  showCost?: boolean;
}) {
  const [date, setDate] = useState(editing?.date ?? today);
  const [name, setName] = useState(editing?.name ?? "");
  const [servings, setServings] = useState(
    editing ? String(editing.servings) : "",
  );
  const current = editing ? preparedRemaining(state, editing) : 0;
  const lastServings = useRef(editing?.servings ?? 0);
  const [quantity, setQuantity] = useState(String(current));
  const [reason, setReason] = useState("");
  const [rows, setRows] = useState<Draft[]>(
    editing
      ? editing.usages.map((u) => ({
          productId: u.productId,
          batchId: "",
          quantity: String(u.quantity),
          unit: u.unit,
          key: crypto.randomUUID(),
        }))
      : [
          {
            productId: "",
            batchId: "",
            quantity: "",
            unit: "g",
            key: crypto.randomUUID(),
          },
        ],
  );
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [error, setError] = useState("");
  const input = () => ({
    date,
    name,
    servings: Number(servings),
    inputs: rows
      .filter((r) => r.productId || r.quantity)
      .map((r) => ({
        productId: r.productId,
        quantity: Number(r.quantity),
        unit: r.unit,
      })),
  });
  const command = (): Command =>
    editing
      ? {
          type: "prepared.update",
          id: editing.id,
          input: input(),
          adjustment: {
            quantity: quantity.trim() ? Number(quantity) : NaN,
            date: today,
            reason,
          },
        }
      : { type: "prepared.create", input: input() };
  const available = state.products.filter(
    (p) =>
      !!editing ||
      stock(state, p.id).quantity > 0 ||
      rows.some((r) => r.productId === p.id),
  );
  let expected = current;
  let recalculate = false;
  let estimate: number | undefined;
  let estimateError = "";
  if (
    name.trim() &&
    servings &&
    rows.some((r) => r.productId) &&
    rows.every((r) => r.productId && r.quantity)
  ) {
    try {
      const c = input();
      const revised = editing
        ? updateCooking(state, editing.id, c.date, c.name, c.servings, c.inputs)
        : undefined;
      if (revised && editing) {
        expected = preparedRemaining(
          revised,
          revised.cookings.find((c) => c.id === editing.id)!,
        );
        recalculate =
          c.servings !== editing.servings ||
          Number(quantity) > expected ||
          cookingCost(revised.cookings.find((c) => c.id === editing.id)!) !==
            cookingCost(editing);
      }
      const cmd = command();
      const next =
        cmd.type === "prepared.update"
          ? updateCookingInventory(state, cmd.id, cmd.input, cmd.adjustment)
          : recordCooking(state, c.date, c.name, c.servings, c.inputs);
      estimate = cookingCost(
        editing
          ? next.cookings.find((c) => c.id === editing.id)!
          : next.cookings.at(-1)!,
      );
    } catch (e) {
      estimateError = e instanceof Error ? e.message : "入力を確認してください";
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(command());
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <form className="entry-form wide" onSubmit={submit}>
      <fieldset className="form-fields" disabled={saving}>
        <TextField
          className="field"
          label="料理名"
          autoFocus={autoFocus}
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 100 } }}
        />
        <div className="two-columns">
          <TextField
            className="field"
            label="作った日"
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            className="field"
            label="作った量"
            type="number"
            required
            value={servings}
            onChange={(e) => {
              const value = e.target.value;
              // Keep the eaten/discarded count when changing the original yield.
              if (
                editing &&
                value.trim() &&
                quantity.trim() &&
                Number.isFinite(Number(value))
              ) {
                setQuantity(
                  String(
                    Math.round(
                      (Number(quantity) +
                        Number(value) -
                        lastServings.current) *
                        1000,
                    ) / 1000,
                  ),
                );
                lastServings.current = Number(value);
              }
              setServings(value);
            }}
            slotProps={{
              htmlInput: { min: 0.001, step: 0.001 },
              input: {
                endAdornment: (
                  <InputAdornment position="end">食分</InputAdornment>
                ),
              },
            }}
          />
        </div>
        {editing && (
          <>
            <RemainingFields
              current={current}
              quantity={quantity}
              unit="食分"
              reason={reason}
              onQuantity={setQuantity}
              onReason={setReason}
              expected={expected}
            />
            {recalculate && (
              <p className="hint" role="status">
                1食分あたりの食費と、過去の食費が再計算されます。
              </p>
            )}
            {Number(quantity) < expected && quantity.trim() && (
              <p className="hint">減らした分は廃棄として記録します。</p>
            )}
          </>
        )}
        <h2>使った食材</h2>
        {available.length === 0 && (
          <div className="empty">
            <p>使える食材がありません。</p>
            {onPurchase && <Button onClick={onPurchase}>購入を記録</Button>}
          </div>
        )}
        {available.length > 0 && (
          <UsedItems
            state={state}
            rows={rows}
            onChange={setRows}
            available={available}
            editing={editing}
            itemLabel="食材"
          />
        )}
        {showCost && (
          <div className="estimate">
            <span>料理の金額</span>
            <strong>{estimate === undefined ? "—" : money(estimate)}</strong>
          </div>
        )}
        {(error || estimateError) && (
          <p className="error" role="alert">
            {error || estimateError}
          </p>
        )}
        <div className="actions">
          {onCancel && (
            <Button type="button" onClick={onCancel} disabled={saving}>
              キャンセル
            </Button>
          )}
          <Button
            type="submit"
            variant="contained"
            disabled={saving || estimate === undefined}
          >
            {editing ? "変更を保存" : "料理を保存"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
