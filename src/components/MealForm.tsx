import type { Command } from "../domain/commands";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { PreparedForm } from "./PreparedForm";
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
  type Cooking,
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
  onCreateCooking,
  cookingOpen = false,
  onCookingChange,
}: {
  editing?: Meal;
  cookingOpen?: boolean;
  onCookingChange?: (open: boolean) => void;
  onCreateCooking?: (command: Command) => Promise<Cooking>;
  onCancel?: () => void;
  state: State;
  today: string;
  onSave: (command: Command) => Promise<void>;
  money: (n: number) => string;
}) {
  const available = state.products.filter(
    (p) => !!editing || stock(state, p.id).quantity > 0,
  );
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
  const [savedCookingId, setSavedCookingId] = useState<string | null>(null);
  const savedCooking = state.cookings.find((c) => c.id === savedCookingId);
  const savedRemaining = savedCooking
    ? preparedRemaining(state, savedCooking)
    : 0;
  const canAddCooking =
    !!savedCooking && savedCooking.date <= date && savedRemaining > 0;
  function addCooking() {
    if (!savedCooking || !canAddCooking) return;
    const row = {
      ...draft(),
      batchId: savedCooking.id,
      quantity: String(Math.min(1, savedRemaining)),
      unit: "食分",
    };
    setRows((current) => {
      const empty = current.findIndex(
        (r) => !r.productId && !r.batchId && !r.quantity,
      );
      return empty < 0
        ? [...current, row]
        : current.map((r, i) => (i === empty ? row : r));
    });
    setSavedCookingId(null);
    setError("");
  }
  const batches = state.cookings.filter(
    (c) => c.date <= date && (!!editing || preparedRemaining(state, c) > 0),
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
    <>
      <form
        hidden={cookingOpen}
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
              label="自炊"
              disabled={saving}
              id={`${sourceFieldsId}-inventory`}
              aria-controls={sourceFieldsId}
            />
            <Tab
              value="direct"
              label="外食など"
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
              label="食事"
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
                label="金額（円）"
                required
                type="number"
                value={cost}
                slotProps={{
                  htmlInput: { min: 0, max: 100000000, step: 1 },
                }}
                onChange={(e) => setCost(e.target.value)}
              />
              <TextField
                label="店名（任意）"
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
              <div className="section-heading">
                <h2>使ったもの</h2>
                {onCreateCooking && (
                  <Button
                    type="button"
                    disabled={saving}
                    onClick={() => onCookingChange?.(true)}
                  >
                    料理を作る
                  </Button>
                )}
              </div>
              {savedCooking && (
                <div className="cooking-result" role="status">
                  <p>「{savedCooking.name}」を保存しました。</p>
                  <Button
                    type="button"
                    disabled={saving || !canAddCooking}
                    onClick={addCooking}
                  >
                    この料理を食事に追加
                  </Button>
                  {savedCooking.date > date && (
                    <p className="hint">作った日以降の食事に追加できます。</p>
                  )}
                  {savedRemaining <= 0 && (
                    <p className="hint">この料理の残量はありません。</p>
                  )}
                </div>
              )}
              {available.length === 0 && batches.length === 0 && (
                <p className="hint">
                  在庫がありません。購入を記録すると食材を選べます。
                </p>
              )}
              <UsedItems
                state={state}
                rows={rows}
                onChange={setRows}
                available={available}
                batches={batches}
                editing={editing}
              />
            </div>
          )}
          {source === "inventory" && (
            <div className="estimate">
              <span>この食事の金額</span>
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
      {cookingOpen && onCreateCooking && (
        <PreparedForm
          state={state}
          today={date}
          cancelLabel="食事入力に戻る"
          autoFocus={false}
          onCancel={() => onCookingChange?.(false)}
          onSave={async (command) => {
            const cooking = await onCreateCooking(command);
            setSavedCookingId(cooking.id);
            onCookingChange?.(false);
          }}
        />
      )}
    </>
  );
}
