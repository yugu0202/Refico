import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
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
          <TextField
            className="field"
            label="単位名"
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            slotProps={{ htmlInput: { maxLength: 20 } }}
            placeholder="合・袋・パック"
          />
          <TextField
            className="field"
            label={`1${name || "単位"}あたりの量（${product.baseUnit}）`}
            type="number"
            required
            value={factor}
            onChange={(e) => setFactor(e.target.value)}
            slotProps={{
              htmlInput: { inputMode: "decimal", min: "0.001", step: "0.001" },
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
