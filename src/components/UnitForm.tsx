import Button from "@mui/material/Button";
import { UnitFields } from "./UnitFields";
import { useState, useRef, type FormEvent } from "react";
import type { Product, Unit } from "../domain/inventory";

export function UnitForm({
  product,
  onSave,
  onCancel,
}: {
  product: Product;
  onSave: (unit: Unit) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [factor, setFactor] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), factor: Number(factor) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  return (
    <section aria-labelledby="unit-title">
      <h2 id="unit-title">{product.name}の単位を追加</h2>
      <form onSubmit={submit}>
        <fieldset className="form-fields" disabled={saving}>
          <UnitFields
            name={name}
            factor={factor}
            base={product.baseUnit}
            autoFocus
            onChange={(name, factor) => {
              setName(name);
              setFactor(factor);
            }}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="actions">
            <Button variant="contained" type="submit" disabled={saving}>
              単位を追加
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
