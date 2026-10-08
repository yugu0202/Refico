import Button from "@mui/material/Button";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { UnitFields } from "./UnitFields";
import { RemainingFields } from "./RemainingFields";
import {
  updateProductInventory,
  type RemainingChange,
} from "../domain/inventory-edit";
import TextField from "@mui/material/TextField";
import { useState, useRef, type FormEvent } from "react";
import {
  baseUnits,
  stock,
  type State,
  createProduct,
  type BaseUnit,
  type Product,
  type Unit,
} from "../domain/inventory";
export function ProductForm({
  onSave,
  onCancel,
  product,
  onSaveChanges,
  embedded = false,
  state,
  today,
}: {
  onSave: (product: Product) => Promise<void>;
  onCancel: () => void;
  product?: Product;
  embedded?: boolean;
  state?: State;
  today?: string;
  onSaveChanges?: (
    name: string,
    units: Unit[],
    adjustment?: RemainingChange,
  ) => Promise<void>;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [base, setBase] = useState<BaseUnit>(product?.baseUnit ?? "g");
  const [units, setUnits] = useState<{ name: string; factor: string }[]>(
    product?.units.map((u) => ({ name: u.name, factor: String(u.factor) })) ??
      [],
  );
  const current =
    product && state ? stock(state, product.id).quantity / 1000 : 0;
  const [quantity, setQuantity] = useState(String(current));
  const [reason, setReason] = useState("");
  const adjustment =
    product && state && today && Number(quantity) !== current
      ? {
          quantity: quantity.trim() ? Number(quantity) : NaN,
          date: today,
          reason,
        }
      : undefined;
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const draftId = useRef(crypto.randomUUID());
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      if (product && onSaveChanges) {
        if (state)
          updateProductInventory(
            state,
            product.id,
            name,
            units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
            adjustment,
          );
        await onSaveChanges(
          name,
          units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
          adjustment,
        );
        return;
      }
      await onSave({
        ...createProduct(
          name,
          base,
          units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
        ),
        id: draftId.current,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section
      className={embedded ? undefined : "inset"}
      aria-labelledby="product-title"
    >
      <h2 id="product-title">
        {product ? `${product.name}を編集` : "食材を追加"}
      </h2>
      <form onSubmit={submit}>
        <fieldset className="form-fields" disabled={saving}>
          <TextField
            className="field"
            label="食材名"
            autoFocus
            required
            slotProps={{ htmlInput: { maxLength: 100 } }}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：白米"
          />
          {product && state && (
            <RemainingFields
              current={current}
              quantity={quantity}
              unit={base}
              reason={reason}
              onQuantity={setQuantity}
              onReason={setReason}
            />
          )}
          <div className="stock-unit-field">
            <span id="stock-unit-label">在庫の単位</span>
            <ToggleButtonGroup
              value={base}
              exclusive
              aria-labelledby="stock-unit-label"
              disabled={!!product || saving}
              onChange={(_, value: BaseUnit | null) => {
                if (value) setBase(value);
              }}
            >
              {baseUnits.map((u) => (
                <ToggleButton key={u} value={u}>
                  {u}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {!product && <p className="hint">登録後は変更できません。</p>}
          </div>
          <h3>
            よく使う単位 <span className="hint">任意</span>
          </h3>
          {units.map((u, index) => (
            <UnitFields
              key={index}
              name={u.name}
              factor={u.factor}
              base={base}
              onChange={(name, factor) =>
                setUnits(
                  units.map((v, i) => (i === index ? { name, factor } : v)),
                )
              }
              onRemove={() => setUnits(units.filter((_, i) => i !== index))}
            />
          ))}
          <Button
            type="button"
            variant="text"
            className="text-button"
            onClick={() => setUnits([...units, { name: "", factor: "" }])}
          >
            ＋ 単位を追加
          </Button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="actions">
            <Button variant="contained" type="submit" disabled={saving}>
              {product ? "変更を保存" : "食材を保存"}
            </Button>
            <Button type="button" onClick={onCancel}>
              キャンセル
            </Button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
