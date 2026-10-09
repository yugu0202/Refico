import { useRef, useState, type ComponentProps } from "react";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import { FullScreenDialog } from "./FullScreenDialog";
import { ProductForm } from "./ProductForm";

export function ProductDialog({
  open,
  ...props
}: Omit<
  ComponentProps<typeof ProductForm>,
  "embedded" | "hideTitle" | "onSavingChange"
> & {
  open: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const close = () => {
    if (!savingRef.current) props.onCancel();
  };
  return (
    <FullScreenDialog
      open={open}
      onClose={close}
      aria-labelledby="product-title"
      slotProps={{ paper: { className: "full-screen-dialog" } }}
    >
      <DialogTitle className="full-screen-heading">
        <span id="product-title">
          {props.product ? `${props.product.name}を編集` : "食材を追加"}
        </span>
        <IconButton
          aria-label="食材の入力を閉じる"
          onClick={close}
          disabled={saving}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        >
          <SvgIcon>
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6-5.6 5.6L5 17.6l5.6-5.6L5 6.4z" />
          </SvgIcon>
        </IconButton>
      </DialogTitle>
      <DialogContent className="full-screen-content">
        {open && (
          <ProductForm
            {...props}
            embedded
            hideTitle
            onCancel={close}
            onSavingChange={(value) => {
              savingRef.current = value;
              setSaving(value);
            }}
          />
        )}
      </DialogContent>
    </FullScreenDialog>
  );
}
