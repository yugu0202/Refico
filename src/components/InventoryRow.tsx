import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import { type Product, type State } from "../domain/inventory";
import { stockDisplayUnit } from "../domain/stock-amount";
import { money, number } from "../format";
import { useInventorySummary } from "../inventory-summary";

export function InventoryRow({
  product,
  state,
  showValue = true,
  onEdit,
}: {
  product: Product;
  state: State;
  showValue?: boolean;
  onEdit?: () => void;
}) {
  const summary = useInventorySummary(state);
  const balance = summary.products.get(product.id)!;
  const last = balance.latest;
  const unit = stockDisplayUnit(product.baseUnit, balance.quantity / 1000);
  const q = `${number(balance.quantity / 1000 / unit.factor, unit.factor === 1000 ? 6 : 3)} ${unit.name}`;
  return (
    <div className="inventory-row">
      <div>
        <strong>{product.name}</strong>
        <p className="hint">
          {last
            ? `最終購入 ${last.date.replaceAll("-", "/")} · ${number(last.quantity)}${last.unit} / ${money(last.price)}`
            : "購入の記録はまだありません"}
        </p>
      </div>
      <div className="inventory-actions">
        <div className="numeric">
          <strong>{q}</strong>
          {showValue && <p className="hint">{money(balance.value)}</p>}
        </div>
        {onEdit && (
          <IconButton
            type="button"
            onClick={onEdit}
            aria-label={`${product.name}を編集`}
            title="食材を編集"
            sx={{ width: 44, height: 44, flexShrink: 0 }}
          >
            <SvgIcon fontSize="small">
              <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm17.71-10.04a.996.996 0 0 0 0-1.41l-2.34-2.34a.996.996 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </SvgIcon>
          </IconButton>
        )}
      </div>
    </div>
  );
}
