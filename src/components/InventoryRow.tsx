import Button from "@mui/material/Button";
import { stock, type Product, type State } from "../domain/inventory";
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
  const last = [...state.purchases]
    .reverse()
    .filter((p) => p.productId === product.id)
    .sort((a, b) => b.date.localeCompare(a.date))
    .at(0);
  const q =
    product.baseUnit === "g" && balance.quantity >= 1000000
      ? `${number(balance.quantity / 1000000)} kg`
      : `${number(balance.quantity / 1000)} ${product.baseUnit}`;
  return (
    <div className="inventory-row">
      <div>
        <strong>{product.name}</strong>
        <p className="hint">
          {last
            ? `最終購入 ${last.date.replaceAll("-", "/")} · ${number(last.quantity)}${last.unit} / ${money(last.price)}`
            : "購入の記録はまだありません"}
        </p>
        {onEdit && (
          <Button
            type="button"
            variant="text"
            onClick={onEdit}
            aria-label={`${product.name}を編集`}
          >
            編集
          </Button>
        )}
      </div>
      <div className="numeric">
        <strong>{q}</strong>
        {showValue && <p className="hint">{money(balance.value)}</p>}
      </div>
    </div>
  );
}
