import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";
import {
  mealKinds,
  recordMeal,
  mealCost,
  stock,
  type State,
} from "../domain/inventory";
import { AmountInput } from "./AmountInput";
interface Draft {
  productId: string;
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
    quantity: "",
    unit: "g",
    key: crypto.randomUUID(),
  });
  const [rows, setRows] = useState<Draft[]>([draft()]);
  const [error, setError] = useState("");
  const update = (key: string, changes: Partial<Draft>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  let estimate: number | undefined;
  let estimateError = "";
  try {
    if (rows.every((r) => r.productId && r.quantity)) {
      const next = recordMeal(
        state,
        date,
        kind,
        rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
      );
      estimate = mealCost(next.meals.at(-1)!);
    }
  } catch (e) {
    estimateError = e instanceof Error ? e.message : "数量を確認してください";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSave(
        recordMeal(
          state,
          date,
          kind,
          rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
        ),
      );
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
      <h2>使った食材</h2>
      {available.length === 0 && (
        <p className="hint">
          在庫がありません。購入を記録すると食材を選べます。
        </p>
      )}
      {rows.map((row, index) => {
        const product = state.products.find((p) => p.id === row.productId);
        return (
          <div className="ingredient" key={row.key}>
            <TextField
              label={`食材 ${index + 1}`}
              select
              required
              value={row.productId}
              slotProps={{
                select: { native: true },
                inputLabel: { shrink: true },
              }}
              onChange={(e) =>
                update(row.key, {
                  productId: e.target.value,
                  unit:
                    state.products.find((p) => p.id === e.target.value)
                      ?.baseUnit ?? "g",
                })
              }
            >
              <option value="" disabled>
                食材を選択
              </option>
              {available
                .filter(
                  (p) =>
                    p.id === row.productId ||
                    !rows.some((r) => r.productId === p.id),
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </TextField>
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
              aria-label={`食材${index + 1}を削除`}
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
        disabled={rows.length >= available.length}
        onClick={() => setRows([...rows, draft()])}
      >
        ＋ 食材を追加
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
          食事を記録
        </Button>
      </div>
    </form>
  );
}
