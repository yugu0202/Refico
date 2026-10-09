import type { Command } from "../domain/commands";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import {
  useState,
  useRef,
  useMemo,
  useImperativeHandle,
  type Ref,
  type FormEvent,
} from "react";
import { useInventorySummary } from "../inventory-summary";
import {
  mealKinds,
  recordMeal,
  mealCost,
  type State,
  type Meal,
} from "../domain/inventory";
import { updateMeal } from "../domain/history";
import { UsedItems, type Draft } from "./UsedItems";
export interface MealFormHandle {
  startForDate: (date: string) => void;
}

export function MealForm({
  state,
  today,
  onSave,
  money,
  editing,
  onCancel,
  onPurchase,
  ref,
}: {
  ref?: Ref<MealFormHandle>;
  editing?: Meal;
  onCancel?: () => void;
  onPurchase?: () => void;
  state: State;
  today: string;
  onSave: (command: Command) => Promise<void>;
  money: (n: number) => string;
}) {
  const [date, setDate] = useState(editing?.date ?? today);
  const [kind, setKind] = useState(editing?.kind ?? "夕食");
  const [hasDirect, setHasDirect] = useState(!!editing?.direct);
  const [cost, setCost] = useState(
    editing?.direct ? String(editing.direct.cost) : "",
  );
  const [place, setPlace] = useState(editing?.direct?.place ?? "");
  const [note, setNote] = useState(editing?.direct?.note ?? "");
  const [rows, setRows] = useState<Draft[]>(
    editing
      ? [
          ...editing.usages.map((u) => ({
            productId: u.productId,
            batchId: "",
            quantity: String(u.quantity),
            unit: u.unit,
            key: crypto.randomUUID(),
          })),
          ...(editing.prepared ?? []).map((p) => ({
            productId: "",
            batchId: p.batchId,
            quantity: String(p.quantity),
            unit: "食分",
            key: crypto.randomUUID(),
          })),
        ]
      : [],
  );
  const initialDate = useRef(editing?.date ?? today);
  useImperativeHandle(
    ref,
    () => ({
      startForDate(nextDate) {
        if (
          editing ||
          rows.length ||
          hasDirect ||
          date !== initialDate.current ||
          kind !== "夕食"
        )
          return;
        initialDate.current = nextDate;
        setDate(nextDate);
      },
    }),
    [editing, rows, hasDirect, date, kind],
  );
  const summary = useInventorySummary(state);
  const available = state.products.filter(
    (p) =>
      !!editing ||
      summary.products.get(p.id)!.quantity > 0 ||
      rows.some((r) => r.productId === p.id),
  );
  const batches = state.cookings.filter(
    (c) =>
      (c.date <= date && summary.cookings.get(c.id)!.quantity / 1000 > 0) ||
      editing?.prepared?.some((p) => p.batchId === c.id) ||
      rows.some((r) => r.batchId === c.id),
  );
  const buildInput = () => ({
    date,
    kind: kind as "朝食" | "昼食" | "夕食" | "その他",
    inputs: rows
      .filter((r) => !r.batchId)
      .map((r) => ({
        productId: r.productId,
        unit: r.unit,
        quantity: Number(r.quantity),
      })),
    prepared: rows
      .filter((r) => r.batchId)
      .map((r) => ({ batchId: r.batchId, quantity: Number(r.quantity) })),
    ...(hasDirect
      ? { direct: { cost: cost.trim() ? Number(cost) : NaN, place, note } }
      : {}),
  });
  const buildCommand = (): Command =>
    editing
      ? { type: "meal.update", id: editing.id, input: buildInput() }
      : { type: "meal.create", input: buildInput() };
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [attempted, setAttempted] = useState(false);
  const { estimate, estimateError } = useMemo(() => {
    try {
      if (
        (rows.length > 0 || hasDirect) &&
        rows.every((r) => (r.productId || r.batchId) && r.quantity.trim()) &&
        (!hasDirect || cost.trim())
      ) {
        const m = buildInput();
        // Optional text does not affect cost; avoid replaying the ledger on each keystroke.
        if (m.direct) m.direct = { cost: m.direct.cost, place: "", note: "" };
        const next = editing
          ? updateMeal(
              state,
              editing.id,
              m.date,
              m.kind,
              m.inputs,
              m.prepared,
              m.direct,
            )
          : recordMeal(state, m.date, m.kind, m.inputs, m.prepared, m.direct);
        return {
          estimate: mealCost(
            editing
              ? next.meals.find((m) => m.id === editing.id)!
              : next.meals.at(-1)!,
          ),
          estimateError: "",
        };
      }
    } catch (e) {
      return {
        estimate: undefined,
        estimateError:
          e instanceof Error ? e.message : "入力内容を確認してください",
      };
    }
    return { estimate: undefined, estimateError: "" };
  }, [state, editing, date, kind, rows, hasDirect, cost]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    setAttempted(true);
    if (estimate === undefined) {
      setError(
        estimateError ||
          (rows.length || hasDirect
            ? "未入力の欄を確認してください"
            : "食材・料理か金額を追加してください"),
      );
      return;
    }
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
      className="entry-form wide"
      onSubmit={submit}
      onChangeCapture={() => setError("")}
      onInvalid={() => setAttempted(true)}
    >
      <fieldset className="form-fields" disabled={saving}>
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
        <h2>使ったもの</h2>
        {available.length === 0 && batches.length === 0 && (
          <div className="empty">
            <p>使える在庫がありません。</p>
            {onPurchase && <Button onClick={onPurchase}>購入を記録</Button>}
          </div>
        )}
        {(available.length > 0 || batches.length > 0 || rows.length > 0) && (
          <UsedItems
            state={state}
            rows={rows}
            onChange={setRows}
            available={available}
            batches={batches}
            editing={editing}
            showErrors={attempted}
            minimumRows={0}
            showAddButton={false}
          />
        )}
        <div className="meal-add-actions">
          {(available.length > 0 || batches.length > 0 || rows.length > 0) && (
            <Button
              type="button"
              variant="text"
              className="text-button"
              disabled={rows.length >= available.length + batches.length}
              onClick={() =>
                setRows([
                  ...rows,
                  {
                    productId: "",
                    batchId: "",
                    quantity: "",
                    unit: "g",
                    key: crypto.randomUUID(),
                  },
                ])
              }
            >
              {rows.length ? "＋ もう1品追加" : "＋ 食材・料理を追加"}
            </Button>
          )}
          {!hasDirect && (
            <Button
              type="button"
              variant="text"
              className="text-button"
              onClick={() => {
                setHasDirect(true);
                setError("");
              }}
            >
              ＋ 金額を入力
            </Button>
          )}
        </div>
        {hasDirect && (
          <section className="direct-meal-fields" aria-label="金額入力">
            <div className="direct-meal-heading">
              <h2>金額入力</h2>
              <IconButton
                type="button"
                aria-label="入力した金額を削除"
                title="削除"
                onClick={() => {
                  setHasDirect(false);
                  setCost("");
                  setPlace("");
                  setNote("");
                  setError("");
                }}
                sx={{ width: 44, height: 44 }}
              >
                <SvgIcon
                  fontSize="small"
                  sx={{
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: 1.8,
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                  }}
                >
                  <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7" />
                </SvgIcon>
              </IconButton>
            </div>
            <TextField
              label="金額（円）"
              required
              type="number"
              value={cost}
              error={
                attempted &&
                (!cost.trim() ||
                  !Number.isInteger(Number(cost)) ||
                  Number(cost) < 0)
              }
              helperText={
                attempted && !cost.trim() ? "金額を入力してください" : undefined
              }
              slotProps={{ htmlInput: { min: 0, max: 100000000, step: 1 } }}
              onChange={(e) => setCost(e.target.value)}
            />
            <TextField
              label="内容（任意）"
              value={note}
              multiline
              minRows={1}
              maxRows={4}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              onChange={(e) => setNote(e.target.value)}
            />
            <TextField
              label="店名・購入先（任意）"
              value={place}
              slotProps={{ htmlInput: { maxLength: 100 } }}
              onChange={(e) => setPlace(e.target.value)}
            />
          </section>
        )}
        <div className="estimate">
          <span>合計</span>
          <strong>{estimate === undefined ? "—" : money(estimate)}</strong>
        </div>
        {(error || estimateError) && (
          <p className="error" role="alert">
            {error || estimateError}
          </p>
        )}
        <div className={editing ? "actions" : "form-footer"}>
          {onCancel && <Button onClick={onCancel}>キャンセル</Button>}
          <Button variant="contained" type="submit" disabled={saving}>
            {editing ? "変更を保存" : "食事を記録"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
