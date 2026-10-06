import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";
import {
  recordStockAdjustment,
  recordPreparedAdjustment,
  preparedBalance,
  type Meal,
  stock,
  type Product,
  type State,
} from "../domain/inventory";
import { money, number } from "../format";

export function StockAdjustmentForm({
  state,
  product,
  prepared,
  today,
  onSave,
  onCancel,
}: {
  state: State;
  product?: Product;
  prepared?: Meal;
  today: string;
  onSave: (state: State) => void;
  onCancel: () => void;
}) {
  const name = prepared ? prepared.batch!.name : product!.name;
  const unit = prepared ? "食分" : product!.baseUnit;
  const balance = prepared
    ? preparedBalance(state, prepared)
    : stock(state, product!.id);
  const adjust = (quantity: number) =>
    prepared
      ? recordPreparedAdjustment(state, prepared.id, quantity, today, reason)
      : recordStockAdjustment(state, product!.id, quantity, today, reason);
  const [quantity, setQuantity] = useState(String(balance.quantity / 1000));
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  let preview: State | undefined;
  let previewError = "";
  try {
    if (quantity.trim()) preview = adjust(Number(quantity));
  } catch (e) {
    previewError = e instanceof Error ? e.message : "入力を確認してください";
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (!quantity.trim()) throw new Error("実際の残量を入力してください");
      onSave(adjust(Number(quantity)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <Dialog
      open
      onClose={onCancel}
      fullWidth
      maxWidth="xs"
      aria-labelledby="adjustment-title"
    >
      <DialogTitle id="adjustment-title">{name}の在庫調整</DialogTitle>
      <DialogContent>
        <form onSubmit={submit}>
          <p>
            現在の残量 {number(balance.quantity / 1000)} {unit}
          </p>
          <TextField
            className="field"
            autoFocus
            required
            label={`実際の残量（${unit}）`}
            type="number"
            value={quantity}
            onChange={(e) => {
              setQuantity(e.target.value);
              setError("");
            }}
            slotProps={{
              htmlInput: { min: 0, step: "0.001", inputMode: "decimal" },
            }}
          />
          <TextField
            className="field"
            label="理由（任意）"
            value={reason}
            placeholder="例：廃棄・記録漏れ"
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />
          {preview && (
            <p className="hint">
              調整量 {Number(quantity) > balance.quantity / 1000 ? "+" : ""}
              {number(Number(quantity) - balance.quantity / 1000)} {unit}
              {" · "}
              {Number(quantity) > balance.quantity / 1000
                ? "追加分の原価"
                : "減少分の原価"}{" "}
              {money(
                Math.abs(
                  (prepared
                    ? preparedBalance(preview, prepared)
                    : stock(preview, product!.id)
                  ).value - balance.value,
                ),
              )}
            </p>
          )}
          {previewError && Number(quantity) !== balance.quantity / 1000 && (
            <p className="error" role="alert">
              {previewError}
            </p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <Button type="submit" variant="contained" disabled={!preview}>
              調整を保存
            </Button>
            <Button type="button" onClick={onCancel}>
              キャンセル
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
