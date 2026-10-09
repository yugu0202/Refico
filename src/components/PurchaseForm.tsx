import type { Command } from "../domain/commands";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { ItemSelect } from "./ItemSelect";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import { useState, useRef, type FormEvent } from "react";
import {
  type State,
  type Product,
  type Unit,
  type Purchase,
  standardUnits,
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
  editing,
  onCancel,
}: {
  editing?: Purchase;
  onCancel?: () => void;
  state: State;
  today: string;
  onSave: (command: Command) => Promise<void>;
  onCreateProduct: (product: Product) => Promise<void>;
  onAddUnit: (product: Product, unit: Unit) => Promise<void>;
}) {
  const initialProduct = state.products.find(
    (p) => p.id === editing?.productId,
  );
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
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
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
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    if (!product) {
      setError("食材を選択してください");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({
        type: editing ? "purchase.update" : "purchase.create",
        ...(editing ? { id: editing.id } : {}),
        input: {
          productId,
          quantity: Number(quantity),
          unit,
          price: Number(price),
          date,
        },
      } as Command);
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
        className="entry-form"
        onSubmit={submit}
        onChangeCapture={() => setError("")}
      >
        <fieldset className="form-fields" disabled={saving}>
          <ItemSelect
            label="食材"
            value={productId}
            options={[
              ...state.products.map((p) => ({ id: p.id, name: p.name })),
              { id: "__add_product__", name: "＋ 食材を追加", action: true },
            ]}
            onChange={(id) => {
              if (id === "__add_product__") {
                setAddingProduct(true);
                return;
              }
              setProductId(id);
              setUnit(state.products.find((p) => p.id === id)?.baseUnit ?? "g");
            }}
          />
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
            <Button variant="contained" disabled={saving} type="submit">
              {editing ? "変更を保存" : "購入を記録"}
            </Button>
          </div>
        </fieldset>
      </form>
      <Dialog
        open={addingProduct}
        onClose={() => {
          if (!savingRef.current) setAddingProduct(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="product-title"
      >
        <DialogContent>
          {addingProduct && (
            <ProductForm
              onCancel={() => setAddingProduct(false)}
              onSave={async (created) => {
                await onCreateProduct(created);
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
        onClose={() => {
          if (!savingRef.current) setAddingUnit(false);
        }}
        fullWidth
        maxWidth="sm"
        aria-labelledby="unit-title"
      >
        <DialogContent>
          {addingUnit && product && (
            <UnitForm
              product={product}
              onCancel={() => setAddingUnit(false)}
              onSave={async (created) => {
                await onAddUnit(selectedProduct!, created);
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
