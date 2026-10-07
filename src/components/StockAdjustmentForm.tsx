import type { Command } from "../domain/commands";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import TextField from "@mui/material/TextField";
import { useState, useRef, type FormEvent } from "react";
import {
  recordStockAdjustment,
  recordPreparedAdjustment,
  preparedBalance,
  cookingCost,
  type Cooking,
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
  prepared?: Cooking;
  today: string;
  onSave: (command: Command) => Promise<void>;
  onCancel: () => void;
}) {
  const name = prepared ? prepared.name : product!.name;
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
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  let preview: State | undefined;
  let previewError = "";
  try {
    if (quantity.trim()) preview = adjust(Number(quantity));
  } catch (e) {
    previewError = e instanceof Error ? e.message : "入力を確認してください";
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (!quantity.trim()) throw new Error("実際の残量を入力してください");
      await onSave({
        type: "stock.adjust",
        id: prepared?.id ?? product!.id,
        prepared: !!prepared,
        quantity: Number(quantity),
        date: today,
        reason,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      onClose={() => {
        if (!savingRef.current) onCancel();
      }}
      fullWidth
      maxWidth="xs"
      aria-labelledby="adjustment-title"
    >
      <DialogTitle id="adjustment-title">{name}の在庫調整</DialogTitle>
      <DialogContent>
        <form onSubmit={submit}>
          <fieldset className="form-fields" disabled={saving}>
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
                {prepared && Number(quantity) > balance.quantity / 1000 ? (
                  <>
                    作った食数{" "}
                    {number(
                      preview.cookings.find((m) => m.id === prepared.id)!
                        .servings,
                    )}
                    食分 · 1食分{" "}
                    {money(
                      cookingCost(prepared) /
                        preview.cookings.find((m) => m.id === prepared.id)!
                          .servings,
                    )}
                  </>
                ) : (
                  <>
                    調整量{" "}
                    {Number(quantity) > balance.quantity / 1000 ? "+" : ""}
                    {number(Number(quantity) - balance.quantity / 1000)} {unit}{" "}
                    ·{" "}
                    {prepared
                      ? "廃棄分の原価"
                      : Number(quantity) > balance.quantity / 1000
                        ? "追加分の原価"
                        : "減少分の原価"}{" "}
                    {money(
                      Math.abs(
                        (prepared
                          ? preparedBalance(
                              preview,
                              preview.cookings.find(
                                (m) => m.id === prepared.id,
                              )!,
                            )
                          : stock(preview, product!.id)
                        ).value - balance.value,
                      ),
                    )}
                  </>
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
              <Button
                type="submit"
                variant="contained"
                disabled={saving || !preview}
              >
                調整を保存
              </Button>
              <Button type="button" onClick={onCancel}>
                キャンセル
              </Button>
            </div>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
