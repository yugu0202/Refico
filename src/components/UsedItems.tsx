import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import { AmountInput } from "./AmountInput";
import {
  preparedRemaining,
  standardUnits,
  type State,
  type Product,
  type Cooking,
  type Usage,
} from "../domain/inventory";
export interface Draft {
  productId: string;
  batchId: string;
  quantity: string;
  unit: string;
  key: string;
}
export function UsedItems({
  state,
  rows,
  onChange: setRows,
  available,
  batches = [],
  editing,
  itemLabel = "使ったもの",
  minimumRows = 1,
  addLabel = "＋ もう1品追加",
}: {
  state: State;
  rows: Draft[];
  onChange: (rows: Draft[]) => void;
  available: Product[];
  batches?: Cooking[];
  editing?: { usages: Usage[] };
  itemLabel?: string;
  minimumRows?: number;
  addLabel?: string;
}) {
  const update = (key: string, changes: Partial<Draft>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const draft = (): Draft => ({
    productId: "",
    batchId: "",
    quantity: "",
    unit: "g",
    key: crypto.randomUUID(),
  });
  return (
    <>
      {rows.map((row, index) => {
        const selectedProduct = state.products.find(
          (p) => p.id === row.productId,
        );
        const old = editing?.usages.find((u) => u.productId === row.productId);
        const product =
          selectedProduct && old
            ? {
                ...selectedProduct,
                units: [
                  ...selectedProduct.units.filter((u) => u.name !== old.unit),
                  ...(standardUnits(selectedProduct.baseUnit).some(
                    (u) => u.name === old.unit,
                  )
                    ? []
                    : [{ name: old.unit, factor: old.factor }]),
                ],
              }
            : selectedProduct;
        return (
          <div className="ingredient" key={row.key}>
            <TextField
              label={`${itemLabel} ${index + 1}`}
              select
              required
              value={
                row.batchId
                  ? `batch:${row.batchId}`
                  : row.productId
                    ? `product:${row.productId}`
                    : ""
              }
              slotProps={{
                select: { native: true },
                inputLabel: { shrink: true },
              }}
              onChange={(e) => {
                const value = e.target.value;
                const isBatch = value.startsWith("batch:");
                const id = value.slice(value.indexOf(":") + 1);
                update(row.key, {
                  productId: isBatch ? "" : id,
                  batchId: isBatch ? id : "",
                  quantity: "",
                  unit: isBatch
                    ? "食分"
                    : (state.products.find((p) => p.id === id)?.baseUnit ??
                      "g"),
                });
              }}
            >
              <option value="" disabled>
                {batches.length ? "食材・料理を選択" : "食材を選択"}
              </option>
              <optgroup label="食材">
                {available
                  .filter(
                    (p) =>
                      p.id === row.productId ||
                      !rows.some((r) => r.productId === p.id),
                  )
                  .map((p) => (
                    <option key={p.id} value={`product:${p.id}`}>
                      {p.name}
                    </option>
                  ))}
              </optgroup>
              {batches.length > 0 && (
                <optgroup label="料理">
                  {batches
                    .filter(
                      (m) =>
                        m.id === row.batchId ||
                        !rows.some((r) => r.batchId === m.id),
                    )
                    .map((m) => (
                      <option key={m.id} value={`batch:${m.id}`}>
                        {m.name}（残り{preparedRemaining(state, m)}
                        食分）
                      </option>
                    ))}
                </optgroup>
              )}
            </TextField>
            {row.batchId && (
              <TextField
                label="食べた量（食分）"
                required
                type="number"
                value={row.quantity}
                slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
                onChange={(e) => update(row.key, { quantity: e.target.value })}
              />
            )}
            {product && (
              <AmountInput
                id={`amount-${row.key}`}
                product={product}
                quantity={row.quantity}
                unit={row.unit}
                onChange={(q, u) => update(row.key, { quantity: q, unit: u })}
              />
            )}
            <IconButton
              type="button"
              aria-label={`${itemLabel}${index + 1}を削除`}
              title="削除"
              disabled={rows.length <= minimumRows}
              onClick={() => setRows(rows.filter((r) => r.key !== row.key))}
              sx={{ width: 44, height: 44 }}
            >
              <SvgIcon
                fontSize="small"
                sx={{
                  fill: "none",
                  stroke: "currentColor",
                  strokeWidth: 1.8,
                  strokeLinecap: "round",
                  strokeLinejoin: "round",
                }}
              >
                <path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7" />
              </SvgIcon>
            </IconButton>
          </div>
        );
      })}
      <Button
        type="button"
        variant="text"
        className="text-button"
        disabled={rows.length >= available.length + batches.length}
        onClick={() => setRows([...rows, draft()])}
      >
        {addLabel}
      </Button>
    </>
  );
}
