import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";
import { recordPurchase, type State } from "../domain/inventory";
import { AmountInput } from "./AmountInput";
export function PurchaseForm({
  state,
  today,
  onSave,
  onAddProduct,
}: {
  state: State;
  today: string;
  onSave: (state: State) => void;
  onAddProduct: () => void;
}) {
  const initialProduct = state.products.at(-1);
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<string>(initialProduct?.baseUnit ?? "g");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const product = state.products.find((p) => p.id === productId);
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSave(
        recordPurchase(
          state,
          productId,
          Number(quantity),
          unit,
          Number(price),
          date,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <form className="entry-form" onSubmit={submit}>
      <TextField
        className="field"
        label="食材"
        select
        required
        value={productId}
        slotProps={{ select: { native: true } }}
        onChange={(e) => {
          setProductId(e.target.value);
          setUnit(
            state.products.find((p) => p.id === e.target.value)?.baseUnit ??
              "g",
          );
        }}
      >
        <option value="" disabled>
          食材を選択
        </option>
        {state.products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </TextField>
      <Button
        type="button"
        variant="text"
        className="text-button"
        onClick={onAddProduct}
      >
        ＋ 新しい食材を追加
      </Button>
      {product && (
        <div className="field">
          <p className="field-caption">購入量</p>
          <AmountInput
            id="purchase-quantity"
            product={product}
            quantity={quantity}
            unit={unit}
            onChange={(q, u) => {
              setQuantity(q);
              setUnit(u);
            }}
          />
        </div>
      )}
      <TextField
        className="field"
        label="購入価格（円）"
        required
        type="number"
        slotProps={{
          htmlInput: { inputMode: "numeric", min: 0, max: 100000000, step: 1 },
        }}
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="税込の支払額"
      />
      <TextField
        className="field"
        label="購入日"
        type="date"
        required
        slotProps={{ inputLabel: { shrink: true } }}
        value={date}
        onChange={(e) => setDate(e.target.value)}
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="form-footer">
        <Button variant="contained" disabled={!product} type="submit">
          購入を記録
        </Button>
      </div>
    </form>
  );
}
