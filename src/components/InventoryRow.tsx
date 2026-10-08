import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import SvgIcon from "@mui/material/SvgIcon";
import {
  latestPurchase,
  stock,
  type Product,
  type State,
} from "../domain/inventory";
import { money, number } from "../format";

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
  const balance = stock(state, product.id);
  const last = latestPurchase(state, product.id);
  const q =
    product.baseUnit === "g" && balance.quantity >= 1000000
      ? `${number(balance.quantity / 1000000)} kg`
      : `${number(balance.quantity / 1000)} ${product.baseUnit}`;
  return (
    <div className="inventory-row">
      <div>
        <Stack direction="row" sx={{ alignItems: "center" }}>
          <strong>{product.name}</strong>
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
        </Stack>
        <p className="hint">
          {last
            ? `最終購入 ${last.date.replaceAll("-", "/")} · ${number(last.quantity)}${last.unit} / ${money(last.price)}`
            : "購入の記録はまだありません"}
        </p>
      </div>
      <Stack
        direction="row"
        spacing={1}
        sx={{ marginLeft: "auto", flexShrink: 0, alignItems: "center" }}
      >
        <div className="numeric">
          <strong>{q}</strong>
          {showValue && <p className="hint">{money(balance.value)}</p>}
        </div>
      </Stack>
    </div>
  );
}
