import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Divider from "@mui/material/Divider";
import { unitsFor, type Product } from "../domain/inventory";
export function AmountInput({
  product,
  quantity,
  unit,
  onChange,
  id,
  onAddUnit,
}: {
  product: Product;
  quantity: string;
  unit: string;
  onChange: (quantity: string, unit: string) => void;
  id: string;
  onAddUnit?: () => void;
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
        slotProps={{ select: { native: !onAddUnit } }}
        onChange={(e) => {
          if (onAddUnit && e.target.value === "") onAddUnit();
          else onChange(quantity, e.target.value);
        }}
      >
        {unitsFor(product).map((u) =>
          onAddUnit ? (
            <MenuItem key={u.name} value={u.name}>
              {u.name}
            </MenuItem>
          ) : (
            <option key={u.name} value={u.name}>
              {u.name}
            </option>
          ),
        )}
        {onAddUnit && <Divider />}
        {onAddUnit && <MenuItem value="">＋ 単位を追加</MenuItem>}
      </TextField>
    </div>
  );
}
