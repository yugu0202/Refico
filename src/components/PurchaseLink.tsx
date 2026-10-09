import ButtonBase from "@mui/material/ButtonBase";

export function PurchaseLink({ onNavigate }: { onNavigate: () => void }) {
  return (
    <ButtonBase
      type="button"
      className="purchase-link"
      disableRipple
      onClick={onNavigate}
    >
      <span>購入の記録へ</span>
      <span className="purchase-link-arrow" aria-hidden="true">
        ›
      </span>
    </ButtonBase>
  );
}
