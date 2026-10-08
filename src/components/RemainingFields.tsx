import TextField from "@mui/material/TextField";
import InputAdornment from "@mui/material/InputAdornment";
import { number } from "../format";

export function RemainingFields({
  current,
  quantity,
  unit,
  reason,
  onQuantity,
  onReason,
  expected = current,
}: {
  current: number;
  quantity: string;
  unit: string;
  reason: string;
  onQuantity: (quantity: string) => void;
  onReason: (reason: string) => void;
  expected?: number;
}) {
  const changed =
    quantity.trim() !== "" &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) !== current;
  const adjusted =
    quantity.trim() !== "" &&
    Number.isFinite(Number(quantity)) &&
    Number(quantity) !== expected;
  return (
    <>
      <TextField
        className="field"
        label="現在の残量"
        required
        type="number"
        value={quantity}
        onChange={(e) => onQuantity(e.target.value)}
        slotProps={{
          htmlInput: { min: 0, step: "0.001", inputMode: "decimal" },
          input: {
            endAdornment: (
              <InputAdornment position="end">{unit}</InputAdornment>
            ),
          },
        }}
      />
      {changed && (
        <p className="hint" role="status">
          {number(current)} {unit} → {quantity} {unit}（
          {number(Math.abs(Number(quantity) - current))} {unit}
          {Number(quantity) > current ? "増加" : "減少"}）
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
