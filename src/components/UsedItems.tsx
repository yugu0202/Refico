import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import TextField from "@mui/material/TextField";
import { AmountInput } from "./AmountInput";
import { ItemSelect } from "./ItemSelect";
import { useInventorySummary } from "../inventory-summary";
import { number, dateLabel } from "../format";
import {
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
  showAddButton = true,
  showErrors = false,
}: {
  state: State;
  rows: Draft[];
  onChange: (rows: Draft[]) => void;
  available: Product[];
  batches?: Cooking[];
  editing?: { usages: Usage[] };
  itemLabel?: string;
  minimumRows?: number;
  showAddButton?: boolean;
  showErrors?: boolean;
}) {
  const summary = useInventorySummary(state);
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
            <ItemSelect
              label={`${itemLabel} ${index + 1}`}
              value={
                row.batchId
                  ? `batch:${row.batchId}`
                  : row.productId
                    ? `product:${row.productId}`
                    : ""
              }
              showErrors={showErrors}
              options={[
                ...available
                  .filter(
                    (p) =>
                      p.id === row.productId ||
                      !rows.some((r) => r.productId === p.id),
                  )
                  .map((p) => ({
                    id: `product:${p.id}`,
                    name: p.name,
                    group: "食材",
                  })),
                ...batches
                  .filter(
                    (c) =>
                      c.id === row.batchId ||
                      !rows.some((r) => r.batchId === c.id),
                  )
                  .map((c) => ({
                    id: `batch:${c.id}`,
                    name: `${c.name}（${dateLabel(c.date)}・残り${number(summary.cookings.get(c.id)!.quantity / 1000)}食分）`,
                    group: "料理",
                  })),
              ]}
              onChange={(value) => {
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
            />
            {row.batchId && (
              <TextField
                label="食べた量（食分）"
                required
                type="number"
                value={row.quantity}
                error={showErrors && !(Number(row.quantity) > 0)}
                helperText={
                  showErrors && !(Number(row.quantity) > 0)
                    ? "0より大きい量を入力してください"
                    : undefined
                }
                slotProps={{ htmlInput: { min: 0.001, step: 0.001 } }}
                onChange={(e) => update(row.key, { quantity: e.target.value })}
              />
            )}
            {product && (
              <AmountInput
                showErrors={showErrors}
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
      {showAddButton && (
        <Button
          type="button"
          variant="text"
          className="text-button"
          disabled={rows.length >= available.length + batches.length}
          onClick={() => setRows([...rows, draft()])}
        >
          ＋ もう1品追加
        </Button>
      )}
    </>
  );
}
