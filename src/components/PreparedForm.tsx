import { useState, useRef, type FormEvent } from "react";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { UsedItems, type Draft } from "./UsedItems";
import {
  cookingCost,
  recordCooking,
  stock,
  type Cooking,
  type State,
} from "../domain/inventory";
import { updateCooking } from "../domain/history";
import type { Command } from "../domain/commands";
import { money } from "../format";
export function PreparedForm({
  state,
  today,
  editing,
  onSave,
  onCancel,
}: {
  state: State;
  today: string;
  editing?: Cooking;
  onSave: (command: Command) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(editing?.date ?? today);
  const [name, setName] = useState(editing?.name ?? "");
  const [servings, setServings] = useState(
    editing ? String(editing.servings) : "",
  );
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
      const next = editing
        ? updateCooking(state, editing.id, c.date, c.name, c.servings, c.inputs)
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
      await onSave(
        editing
          ? { type: "prepared.update", id: editing.id, input: input() }
          : { type: "prepared.create", input: input() },
      );
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
          autoFocus
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
            label="作った量（食分）"
            type="number"
            required
            value={servings}
            onChange={(e) => setServings(e.target.value)}
            slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
          />
        </div>
        <h2>使った食材</h2>
        {state.products.length === 0 && (
          <p className="hint">
            在庫がありません。購入を記録すると食材を選べます。
          </p>
        )}
        <UsedItems
          state={state}
          rows={rows}
          onChange={setRows}
          available={state.products.filter(
            (p) => !!editing || stock(state, p.id).quantity > 0,
          )}
          editing={editing}
          itemLabel="食材"
        />
        <div className="estimate">
          <span>料理の金額</span>
          <strong>{estimate === undefined ? "—" : money(estimate)}</strong>
        </div>
        {(error || estimateError) && (
          <p className="error" role="alert">
            {error || estimateError}
          </p>
        )}
        <div className="actions">
          <Button type="button" onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
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
