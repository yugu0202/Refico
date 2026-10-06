import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { useState, type FormEvent } from "react";
import {
  baseUnits,
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
}: {
  onSave: (product: Product) => void;
  onCancel: () => void;
  product?: Product;
  onSaveChanges?: (name: string, units: Unit[]) => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [base, setBase] = useState<BaseUnit>(product?.baseUnit ?? "g");
  const [units, setUnits] = useState<{ name: string; factor: string }[]>(
    product?.units.map((u) => ({ name: u.name, factor: String(u.factor) })) ??
      [],
  );
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      if (product && onSaveChanges) {
        onSaveChanges(
          name,
          units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
        );
        return;
      }
      onSave(
        createProduct(
          name,
          base,
          units.map((u) => ({ name: u.name, factor: Number(u.factor) })),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    }
  }
  return (
    <section className="inset" aria-labelledby="product-title">
      <h2 id="product-title">
        {product ? `${product.name}を編集` : "食材を追加"}
      </h2>
      <form onSubmit={submit}>
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
        <TextField
          className="field"
          label="在庫の基準単位"
          select
          disabled={!!product}
          value={base}
          slotProps={{ select: { native: true } }}
          onChange={(e) => setBase(e.target.value as BaseUnit)}
        >
          {baseUnits.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </TextField>
        <p className="hint">kg ↔ g、L ↔ ml は自動で換算します。</p>
        {product && (
          <p className="hint">
            食材名は履歴にも反映します。単位の換算値は今後の記録に適用し、過去の数量・原価は保持します。
          </p>
        )}
        <h3>この食材で使う単位</h3>
        {units.map((u, index) => (
          <div className="unit-row" key={index}>
            <TextField
              label="単位名"
              required
              value={u.name}
              slotProps={{ htmlInput: { maxLength: 20 } }}
              placeholder="合・枚・パック"
              onChange={(e) =>
                setUnits(
                  units.map((v, i) =>
                    i === index ? { ...v, name: e.target.value } : v,
                  ),
                )
              }
            />
            <span>1{u.name || "単位"} =</span>
            <TextField
              label="基準量"
              required
              type="number"
              slotProps={{
                htmlInput: {
                  inputMode: "decimal",
                  min: "0.001",
                  step: "0.001",
                },
              }}
              value={u.factor}
              onChange={(e) =>
                setUnits(
                  units.map((v, i) =>
                    i === index ? { ...v, factor: e.target.value } : v,
                  ),
                )
              }
            />
            <span>{base}</span>
            <Button
              type="button"
              variant="text"
              className="text-button"
              aria-label={`${u.name || "単位"}を削除`}
              onClick={() => setUnits(units.filter((_, i) => i !== index))}
            >
              削除
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="text"
          className="text-button"
          onClick={() => setUnits([...units, { name: "", factor: "" }])}
        >
          ＋ 単位を追加
        </Button>
        <p className="hint">
          例：白米は 1合 = 150g、卵は 1パック =
          10個。換算値は食材に合わせて登録します。
        </p>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="actions">
          <Button variant="contained" type="submit">
            {product ? "変更を保存" : "食材を保存"}
          </Button>
          <Button type="button" onClick={onCancel}>
            キャンセル
          </Button>
        </div>
      </form>
    </section>
  );
}
