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
  type Purchase,
  standardUnits,
} from "../domain/inventory";
import { updatePurchase } from "../domain/history";
import { AmountInput } from "./AmountInput";
import { ProductForm } from "./ProductForm";
import { UnitForm } from "./UnitForm";
export function PurchaseForm({
  state,
  today,
  onSave,
  onCreateProduct,
  onAddUnit,
  editing,
  onCancel,
}: {
  editing?: Purchase;
  onCancel?: () => void;
  state: State;
  today: string;
  onSave: (state: State) => void;
  onCreateProduct: (product: Product) => void;
  onAddUnit: (product: Product, unit: Unit) => void;
}) {
  const initialProduct =
    state.products.find((p) => p.id === editing?.productId) ??
    state.products.at(-1);
  const [productId, setProductId] = useState(initialProduct?.id ?? "");
  const [quantity, setQuantity] = useState(
    editing ? String(editing.quantity) : "",
  );
  const [unit, setUnit] = useState<string>(
    editing?.unit ?? initialProduct?.baseUnit ?? "g",
  );
  const [price, setPrice] = useState(editing ? String(editing.price) : "");
  const [date, setDate] = useState(editing?.date ?? today);
  const [error, setError] = useState("");
  const [addingProduct, setAddingProduct] = useState(false);
  const [addingUnit, setAddingUnit] = useState(false);
  const selectedProduct = state.products.find((p) => p.id === productId);
  const product =
    selectedProduct && editing?.productId === productId
      ? {
          ...selectedProduct,
          units: [
            ...selectedProduct.units.filter((u) => u.name !== editing.unit),
            ...(standardUnits(selectedProduct.baseUnit).some(
              (u) => u.name === editing.unit,
            )
              ? []
              : [{ name: editing.unit, factor: editing.factor }]),
          ],
        }
      : selectedProduct;
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      onSave(
        editing
          ? updatePurchase(state, editing.id, {
              productId,
              quantity: Number(quantity),
              unit,
              price: Number(price),
              date,
            })
          : recordPurchase(
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
        <div className={editing ? "actions" : "form-footer"}>
          {onCancel && <Button onClick={onCancel}>キャンセル</Button>}
          <Button variant="contained" disabled={!product} type="submit">
            {editing ? "変更を保存" : "購入を記録"}
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
                onAddUnit(selectedProduct!, created);
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
