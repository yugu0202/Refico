import TextField from "@mui/material/TextField";
import { unitsFor, type Product } from "../domain/inventory";
export function AmountInput({
  product,
  quantity,
  unit,
  onChange,
  id,
}: {
  product: Product;
  quantity: string;
  unit: string;
  onChange: (quantity: string, unit: string) => void;
  id: string;
}) {
  return (
    <div className="amount-input">
      <TextField
        id={id}
        label="数量"
        type="number"
        required
        slotProps={{
          htmlInput: { inputMode: "decimal", min: "0.001", step: "any" },
        }}
        value={quantity}
        onChange={(e) => onChange(e.target.value, unit)}
      />
      <TextField
        select
        label="単位"
        value={unit}
        slotProps={{ select: { native: true } }}
        onChange={(e) => onChange(quantity, e.target.value)}
      >
        {unitsFor(product).map((u) => (
          <option key={u.name} value={u.name}>
            {u.name}
          </option>
        ))}
      </TextField>
    </div>
  );
}
