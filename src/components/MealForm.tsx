import type { Command } from "../domain/commands";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
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
  standardUnits,
} from "../domain/inventory";
import { updateMeal } from "../domain/history";
import { AmountInput } from "./AmountInput";
interface Draft {
  productId: string;
  batchId: string;
  quantity: string;
  unit: string;
  key: string;
}
export function MealForm({
  state,
  today,
  onSave,
  money,
  editing,
  onCancel,
}: {
  editing?: Meal;
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
  const [batchEnabled, setBatchEnabled] = useState(!!editing?.batch);
  const [name, setName] = useState(editing?.batch?.name ?? "");
  const [servings, setServings] = useState(
    editing?.batch ? String(editing.batch.servings) : "",
  );
  const [eaten, setEaten] = useState(
    String(editing?.batch?.eatenServings ?? 0),
  );
  const batches = state.meals.filter(
    (m) =>
      m.id !== editing?.id &&
      m.batch &&
      m.date <= date &&
      (!!editing || preparedRemaining(state, m) > 0),
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
    const batch = batchEnabled
      ? { name, servings: Number(servings), eatenServings: Number(eaten) }
      : undefined;
    const prepared = batchEnabled
      ? []
      : rows
          .filter((r) => r.batchId)
          .map((r) => ({ batchId: r.batchId, quantity: Number(r.quantity) }));
    return {
      date,
      kind: kind as "朝食" | "昼食" | "夕食" | "その他",
      inputs,
      batch,
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
    const batch = m.source === "direct" ? undefined : m.batch;
    const prepared = m.source === "direct" ? [] : m.prepared;
    const direct =
      m.source === "direct"
        ? { cost: m.cost, place: m.place, note: m.note }
        : undefined;
    return editing
      ? updateMeal(
          state,
          editing.id,
          m.date,
          m.kind,
          inputs,
          batch,
          prepared,
          direct,
        )
      : recordMeal(state, m.date, m.kind, inputs, batch, prepared, [], direct);
  };
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const update = (key: string, changes: Partial<Draft>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
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
            <FormControlLabel
              control={
                <Checkbox
                  checked={batchEnabled}
                  disabled={rows.some((r) => !!r.batchId)}
                  onChange={(e) => setBatchEnabled(e.target.checked)}
                />
              }
              label="残りを作り置きにする"
            />
            {batchEnabled && (
              <div className="batch-fields">
                <TextField
                  label="料理名"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="two-columns batch-amounts">
                  <TextField
                    label="作った量（食分）"
                    required
                    type="number"
                    slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
                    value={servings}
                    onChange={(e) => setServings(e.target.value)}
                  />
                  <TextField
                    label="今回食べた量（食分）"
                    required
                    type="number"
                    slotProps={{ htmlInput: { min: 0, step: 0.001 } }}
                    value={eaten}
                    onChange={(e) => setEaten(e.target.value)}
                  />
                </div>
              </div>
            )}
            <h2>使ったもの</h2>
            {available.length === 0 &&
              (batchEnabled || batches.length === 0) && (
                <p className="hint">
                  在庫がありません。購入を記録すると食材を選べます。
                </p>
              )}
            {rows.map((row, index) => {
              const selectedProduct = state.products.find(
                (p) => p.id === row.productId,
              );
              const old = editing?.usages.find(
                (u) => u.productId === row.productId,
              );
              const product =
                selectedProduct && old
                  ? {
                      ...selectedProduct,
                      units: [
                        ...selectedProduct.units.filter(
                          (u) => u.name !== old.unit,
                        ),
                        ...(standardUnits(selectedProduct.baseUnit).some(
                          (u) => u.name === old.unit,
                        )
                          ? []
                          : [{ name: old.unit, factor: old.factor }]),
                      ],
                    }
                  : selectedProduct;
              return (
                <div className="ingredient" key={row.key}>
                  <TextField
                    label={`使ったもの ${index + 1}`}
                    select
                    required
                    value={
                      row.batchId
                        ? `batch:${row.batchId}`
                        : row.productId
                          ? `product:${row.productId}`
                          : ""
                    }
                    slotProps={{
                      select: { native: true },
                      inputLabel: { shrink: true },
                    }}
                    onChange={(e) => {
                      const value = e.target.value;
                      const isBatch = value.startsWith("batch:");
                      const id = value.slice(value.indexOf(":") + 1);
                      update(row.key, {
                        productId: isBatch ? "" : id,
                        batchId: isBatch ? id : "",
                        quantity: "",
                        unit: isBatch
                          ? "食分"
                          : (state.products.find((p) => p.id === id)
                              ?.baseUnit ?? "g"),
                      });
                    }}
                  >
                    <option value="" disabled>
                      食材・作り置きを選択
                    </option>
                    <optgroup label="食材">
                      {available
                        .filter(
                          (p) =>
                            p.id === row.productId ||
                            !rows.some((r) => r.productId === p.id),
                        )
                        .map((p) => (
                          <option key={p.id} value={`product:${p.id}`}>
                            {p.name}
                          </option>
                        ))}
                    </optgroup>
                    {!batchEnabled && batches.length > 0 && (
                      <optgroup label="作り置き">
                        {batches
                          .filter(
                            (m) =>
                              m.id === row.batchId ||
                              !rows.some((r) => r.batchId === m.id),
                          )
                          .map((m) => (
                            <option key={m.id} value={`batch:${m.id}`}>
                              {m.batch!.name}（残り{preparedRemaining(state, m)}
                              食分）
                            </option>
                          ))}
                      </optgroup>
                    )}
                  </TextField>
                  {row.batchId && (
                    <TextField
                      label="食べた量（食分）"
                      required
                      type="number"
                      value={row.quantity}
                      slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
                      onChange={(e) =>
                        update(row.key, { quantity: e.target.value })
                      }
                    />
                  )}
                  {product && (
                    <AmountInput
                      id={`amount-${row.key}`}
                      product={product}
                      quantity={row.quantity}
                      unit={row.unit}
                      onChange={(q, u) =>
                        update(row.key, { quantity: q, unit: u })
                      }
                    />
                  )}
                  <IconButton
                    type="button"
                    aria-label={`使ったもの${index + 1}を削除`}
                    title="削除"
                    disabled={rows.length === 1}
                    onClick={() =>
                      setRows(rows.filter((r) => r.key !== row.key))
                    }
                    sx={{ width: 44, height: 44 }}
                  >
                    <SvgIcon fontSize="small">
                      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zm3.46-7.88 1.41-1.41L12 10.83l1.12-1.12 1.41 1.41L13.41 12l1.12 1.12-1.41 1.41L12 13.41l-1.12 1.12-1.41-1.41L10.59 12l-1.13-1.12zM15.5 4l-1-1h-5l-1 1H5v2h14V4z" />
                    </SvgIcon>
                  </IconButton>
                </div>
              );
            })}
            <Button
              type="button"
              variant="text"
              className="text-button"
              disabled={
                rows.length >=
                available.length + (batchEnabled ? 0 : batches.length)
              }
              onClick={() => setRows([...rows, draft()])}
            >
              ＋ 追加
            </Button>
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
            {editing
              ? "変更を保存"
              : source === "inventory" && batchEnabled && Number(eaten) === 0
                ? "作り置きを保存"
                : "食事を記録"}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
