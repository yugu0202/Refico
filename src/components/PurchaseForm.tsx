import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import { useState, type FormEvent } from "react";
import {
  recordPurchase,
  type State,
  type Product,
  type Unit,
} from "../domain/inventory";
import { AmountInput } from "./AmountInput";
import { ProductForm } from "./ProductForm";
import { UnitForm } from "./UnitForm";
export function PurchaseForm({
  state,
  today,
  onSave,
  onCreateProduct,
  onAddUnit,
}: {
  state: State;
  today: string;
  onSave: (state: State) => void;
  onCreateProduct: (product: Product) => void;
  onAddUnit: (product: Product, unit: Unit) => void;
}) {
  const initialProduct = state.products.at(-1);
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState<string>(initialProduct?.baseUnit ?? "g");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
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
    <>
      <form className="entry-form" onSubmit={submit}>
        <TextField
          className="field"
          label="食材"
          select
          required
          value={productId}
          onChange={(e) => {
            if (e.target.value === "__add_product__") {
              setAddingProduct(true);
              return;
            }
            setProductId(e.target.value);
            setUnit(
              state.products.find((p) => p.id === e.target.value)?.baseUnit ??
                "g",
            );
          }}
        >
          <MenuItem value="" disabled>
            食材を選択
          </MenuItem>
          {state.products.map((p) => (
            <MenuItem key={p.id} value={p.id}>
              {p.name}
            </MenuItem>
          ))}
          <Divider />
          <MenuItem value="__add_product__">＋ 食材を追加</MenuItem>
        </TextField>
        {product && (
          <div className="field">
            <p className="field-caption">購入量</p>
            <AmountInput
              id="purchase-quantity"
              product={product}
              quantity={quantity}
              unit={unit}
              onAddUnit={() => setAddingUnit(true)}
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
            htmlInput: {
              inputMode: "numeric",
              min: 0,
              max: 100000000,
              step: 1,
            },
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
      <Dialog
        open={addingProduct}
        onClose={() => setAddingProduct(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="product-title"
      >
        <DialogContent>
          {addingProduct && (
            <ProductForm
              onCancel={() => setAddingProduct(false)}
              onSave={(created) => {
                onCreateProduct(created);
                setProductId(created.id);
                setUnit(created.baseUnit);
                setAddingProduct(false);
                setError("");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={addingUnit}
        onClose={() => setAddingUnit(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="unit-title"
      >
        <DialogContent>
          {addingUnit && product && (
            <UnitForm
              product={product}
              onCancel={() => setAddingUnit(false)}
              onSave={(created) => {
                onAddUnit(product, created);
                setUnit(created.name.trim());
                setAddingUnit(false);
                setError("");
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
