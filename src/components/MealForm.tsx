import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";
import {
  mealKinds,
  recordMeal,
  mealCost,
  stock,
  preparedRemaining,
  type State,
} from "../domain/inventory";
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
}: {
  state: State;
  today: string;
  onSave: (state: State) => void;
  money: (n: number) => string;
}) {
  const available = state.products.filter(
    (p) => stock(state, p.id).quantity > 0,
  );
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState("夕食");
  const draft = (): Draft => ({
    productId: "",
    batchId: "",
    quantity: "",
    unit: "g",
    key: crypto.randomUUID(),
  });
  const [rows, setRows] = useState<Draft[]>([draft()]);
  const [batchEnabled, setBatchEnabled] = useState(false);
  const [name, setName] = useState("");
  const [servings, setServings] = useState("");
  const [eaten, setEaten] = useState("0");
  const batches = state.meals.filter(
    (m) => m.batch && m.date <= date && preparedRemaining(state, m) > 0,
  );
  const buildRecord = () =>
    recordMeal(
      state,
      date,
      kind,
      rows
        .filter((r) => !r.batchId && (r.productId || r.quantity))
        .map((r) => ({ ...r, quantity: Number(r.quantity) })),
      batchEnabled
        ? { name, servings: Number(servings), eatenServings: Number(eaten) }
        : undefined,
      batchEnabled
        ? []
        : rows
            .filter((r) => r.batchId)
            .map((r) => ({
              batchId: r.batchId,
              quantity: Number(r.quantity),
            })),
    );
  const [error, setError] = useState("");
  const update = (key: string, changes: Partial<Draft>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  let estimate: number | undefined;
  let estimateError = "";
  try {
    if (
      rows.some((r) => r.productId || r.batchId) &&
      rows
        .filter((r) => r.productId || r.batchId || r.quantity)
        .every((r) => (r.productId || r.batchId) && r.quantity)
    ) {
      const next = buildRecord();
      estimate = mealCost(next.meals.at(-1)!);
    }
  } catch (e) {
    estimateError = e instanceof Error ? e.message : "数量を確認してください";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSave(buildRecord());
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <form className="entry-form wide" onSubmit={submit}>
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
      {available.length === 0 && (batchEnabled || batches.length === 0) && (
        <p className="hint">
          在庫がありません。購入を記録すると食材を選べます。
        </p>
      )}
      {rows.map((row, index) => {
        const product = state.products.find((p) => p.id === row.productId);
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
                    : (state.products.find((p) => p.id === id)?.baseUnit ??
                      "g"),
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
                        {m.batch!.name}（残り{preparedRemaining(state, m)}食分）
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
                onChange={(e) => update(row.key, { quantity: e.target.value })}
              />
            )}
            {product && (
              <AmountInput
                id={`amount-${row.key}`}
                product={product}
                quantity={row.quantity}
                unit={row.unit}
                onChange={(q, u) => update(row.key, { quantity: q, unit: u })}
              />
            )}
            <Button
              type="button"
              variant="text"
              className="text-button"
              aria-label={`使ったもの${index + 1}を削除`}
              disabled={rows.length === 1}
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
            >
              削除
            </Button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="text"
        className="text-button"
        disabled={
          rows.length >= available.length + (batchEnabled ? 0 : batches.length)
        }
        onClick={() => setRows([...rows, draft()])}
      >
        ＋ 追加
      </Button>
      <div className="estimate">
        <span>この食事の金額</span>
        <strong>{estimate === undefined ? "—" : money(estimate)}</strong>
      </div>
      {(error || estimateError) && (
        <p className="error" role="alert">
          {error || estimateError}
        </p>
      )}
      <div className="form-footer">
        <Button
          variant="contained"
          type="submit"
          disabled={estimate === undefined}
        >
          {batchEnabled && Number(eaten) === 0
            ? "作り置きを保存"
            : "食事を記録"}
        </Button>
      </div>
    </form>
  );
}
