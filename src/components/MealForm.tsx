import type { Command } from "../domain/commands";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, useRef, useId, type FormEvent } from "react";
import {
  mealKinds,
  recordMeal,
  mealCost,
  stock,
  preparedRemaining,
  type State,
  type Meal,
  type MealInput,
} from "../domain/inventory";
import { updateMeal } from "../domain/history";
import { UsedItems, type Draft } from "./UsedItems";
export function MealForm({
  state,
  today,
  onSave,
  money,
  editing,
  onCancel,
  onPurchase,
}: {
  editing?: Meal;
  onCancel?: () => void;
  onPurchase?: () => void;
  state: State;
  today: string;
  onSave: (command: Command) => Promise<void>;
  money: (n: number) => string;
}) {
  const [date, setDate] = useState(editing?.date ?? today);
  const sourceFieldsId = useId();
  const [kind, setKind] = useState(editing?.kind ?? "夕食");
  const [source, setSource] = useState<"inventory" | "direct">(
    editing?.direct ? "direct" : "inventory",
  );
  const [cost, setCost] = useState(
    editing?.direct ? String(editing.direct.cost) : "",
  );
  const [place, setPlace] = useState(editing?.direct?.place ?? "");
  const [note, setNote] = useState(editing?.direct?.note ?? "");
  const draft = (): Draft => ({
    productId: "",
    batchId: "",
    quantity: "",
    unit: "g",
    key: crypto.randomUUID(),
  });
  const [rows, setRows] = useState<Draft[]>(
    editing
      ? [
          ...editing.usages.map((u) => ({
            ...draft(),
            productId: u.productId,
            quantity: String(u.quantity),
            unit: u.unit,
          })),
          ...(editing.prepared ?? []).map((p) => ({
            ...draft(),
            batchId: p.batchId,
            quantity: String(p.quantity),
            unit: "食分",
          })),
        ].concat(editing.direct ? [draft()] : [])
      : [draft()],
  );
  const available = state.products.filter(
    (p) =>
      !!editing ||
      stock(state, p.id).quantity > 0 ||
      rows.some((r) => r.productId === p.id),
  );
  const batches = state.cookings.filter(
    (c) =>
      (c.date <= date && preparedRemaining(state, c) > 0) ||
      editing?.prepared?.some((p) => p.batchId === c.id) ||
      rows.some((r) => r.batchId === c.id),
  );
  const buildInput = (): Extract<Command, { type: "meal.create" }>["input"] => {
    if (source === "direct")
      return {
        source,
        date,
        kind: kind as "朝食" | "昼食" | "夕食" | "その他",
        cost: cost.trim() ? Number(cost) : NaN,
        place,
        note,
      };
    const inputs: MealInput[] = rows
      .filter((r) => !r.batchId && (r.productId || r.quantity))
      .map((r) => ({
        productId: r.productId,
        unit: r.unit,
        quantity: Number(r.quantity),
      }));
    const prepared = rows
      .filter((r) => r.batchId)
      .map((r) => ({ batchId: r.batchId, quantity: Number(r.quantity) }));
    return {
      date,
      kind: kind as "朝食" | "昼食" | "夕食" | "その他",
      inputs,
      prepared,
    };
  };
  const buildCommand = (): Command =>
    editing
      ? { type: "meal.update", id: editing.id, input: buildInput() }
      : { type: "meal.create", input: buildInput() };
  const buildRecord = () => {
    const m = buildInput();
    const inputs = m.source === "direct" ? [] : m.inputs;
    const prepared = m.source === "direct" ? [] : m.prepared;
    const direct =
      m.source === "direct"
        ? { cost: m.cost, place: m.place, note: m.note }
        : undefined;
    return editing
      ? updateMeal(state, editing.id, m.date, m.kind, inputs, prepared, direct)
      : recordMeal(state, m.date, m.kind, inputs, prepared, direct);
  };
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  let estimate: number | undefined;
  let estimateError = "";
  try {
    if (
      (source === "direct" && cost.trim()) ||
      (source === "inventory" &&
        rows.some((r) => r.productId || r.batchId) &&
        rows
          .filter((r) => r.productId || r.batchId || r.quantity)
          .every((r) => (r.productId || r.batchId) && r.quantity))
    ) {
      const next = buildRecord();
      estimate = mealCost(
        editing
          ? next.meals.find((m) => m.id === editing.id)!
          : next.meals.at(-1)!,
      );
    }
  } catch (e) {
    estimateError = e instanceof Error ? e.message : "数量を確認してください";
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave(buildCommand());
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <form
      className={`entry-form wide${source === "direct" ? " direct-meal-form" : ""}`}
      onSubmit={submit}
    >
      <fieldset className="form-fields" disabled={saving}>
        <Tabs
          value={source}
          aria-label="食事の記録方法"
          onChange={(_, value: "inventory" | "direct") => {
            setSource(value);
            setError("");
          }}
          sx={{
            mb: 2,
            minHeight: 44,
            "& .MuiTab-root": {
              minHeight: 44,
              minWidth: 88,
              px: 2,
              fontWeight: 400,
            },
            "& .Mui-selected": { fontWeight: 700 },
          }}
        >
          <Tab
            value="inventory"
            label="食材・料理から"
            disabled={saving}
            id={`${sourceFieldsId}-inventory`}
            aria-controls={sourceFieldsId}
          />
          <Tab
            value="direct"
            label="金額を入力"
            disabled={saving}
            id={`${sourceFieldsId}-direct`}
            aria-controls={sourceFieldsId}
          />
        </Tabs>
        <div className="two-columns">
          <TextField
            className="field"
            label="食事の日付"
            required
            type="date"
            slotProps={{ inputLabel: { shrink: true } }}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <TextField
            className="field"
            label="食事の種類"
            select
            value={kind}
            slotProps={{ select: { native: true } }}
            onChange={(e) => setKind(e.target.value)}
          >
            {mealKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </TextField>
        </div>
        {source === "direct" ? (
          <div
            className="direct-meal-fields"
            id={sourceFieldsId}
            role="tabpanel"
            aria-labelledby={`${sourceFieldsId}-direct`}
          >
            <TextField
              label="食事代（円）"
              required
              type="number"
              value={cost}
              slotProps={{
                htmlInput: { min: 0, max: 100000000, step: 1 },
              }}
              onChange={(e) => setCost(e.target.value)}
            />
            <TextField
              label="店名・購入先（任意）"
              value={place}
              slotProps={{
                htmlInput: { maxLength: 100 },
              }}
              onChange={(e) => setPlace(e.target.value)}
            />
            <TextField
              label="メモ（任意）"
              value={note}
              multiline
              minRows={1}
              maxRows={4}
              slotProps={{
                htmlInput: { maxLength: 500 },
              }}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        ) : (
          <div
            className="inventory-meal-fields"
            id={sourceFieldsId}
            role="tabpanel"
            aria-labelledby={`${sourceFieldsId}-inventory`}
          >
            <h2>使ったもの</h2>
            {available.length === 0 && batches.length === 0 && (
              <div className="empty">
                <p>使える在庫がありません。</p>
                {onPurchase && <Button onClick={onPurchase}>購入を記録</Button>}
                <Button onClick={() => setSource("direct")}>金額を入力</Button>
              </div>
            )}
            {(available.length > 0 || batches.length > 0) && (
              <UsedItems
                state={state}
                rows={rows}
                onChange={setRows}
                available={available}
                batches={batches}
                editing={editing}
              />
            )}
          </div>
        )}
        {source === "inventory" && (
          <div className="estimate">
            <span>この食事の食費</span>
            <strong>{estimate === undefined ? "—" : money(estimate)}</strong>
          </div>
        )}
        {(error || estimateError) && (
          <p className="error" role="alert">
            {error || estimateError}
          </p>
        )}
        <div className={editing ? "actions" : "form-footer"}>
          {onCancel && <Button onClick={onCancel}>キャンセル</Button>}
          <Button
            variant="contained"
            type="submit"
            disabled={saving || estimate === undefined}
          >
            {editing ? "変更を保存" : "食事を記録"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
