import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import { stockQuantity } from "../domain/stock-amount";
import type { Unit } from "../domain/inventory";
import { number } from "../format";

export function RemainingFields({
  current,
  quantity,
  unit,
  reason,
  onQuantity,
  onReason,
  expected = current,
  factor = 1,
  units,
  onUnit,
}: {
  current: number;
  quantity: string;
  unit: string;
  reason: string;
  onQuantity: (quantity: string) => void;
  onReason: (reason: string) => void;
  expected?: number;
  factor?: number;
  units?: Unit[];
  onUnit?: (unit: string) => void;
}) {
  const target = stockQuantity(quantity, { name: unit, factor });
  const changed = Number.isFinite(target) && target !== current;
  const adjusted = Number.isFinite(target) && target !== expected;
  const digits = factor === 1000 ? 6 : 3;
  const selectable = onUnit && units && units.length > 1;
  return (
    <>
      <div className={selectable ? "remaining-input" : undefined}>
        <TextField
          className="field"
          label="現在の残量"
          required
          type="number"
          value={quantity}
          onChange={(e) => onQuantity(e.target.value)}
          slotProps={{
            htmlInput: { min: 0, step: 0.001 / factor, inputMode: "decimal" },
            input: {
              endAdornment: !selectable && (
                <InputAdornment position="end">{unit}</InputAdornment>
              ),
            },
          }}
        />
        {selectable && (
          <TextField
            select
            label="単位"
            value={unit}
            slotProps={{ select: { native: true } }}
            onChange={(e) => onUnit(e.target.value)}
          >
            {units.map((u) => (
              <option key={u.name} value={u.name}>
                {u.name}
              </option>
            ))}
          </TextField>
        )}
      </div>
      {changed && (
        <p className="hint" role="status">
          {number(current / factor, digits)} {unit} → {quantity} {unit}（
          {number(Math.abs(target - current) / factor, digits)} {unit}
          {target > current ? "増加" : "減少"}）
        </p>
      )}
      {adjusted && (
        <TextField
          className="field"
          label="理由（任意）"
          value={reason}
          placeholder="例：廃棄・記録漏れ"
          onChange={(e) => onReason(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 200 } }}
        />
      )}
    </>
  );
}
