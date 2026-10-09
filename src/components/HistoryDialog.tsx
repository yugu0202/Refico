import { FullScreenDialog } from "./FullScreenDialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import { History, type HistoryProps } from "./History";

export function HistoryDialog({
  open,
  onClose,
  ...props
}: HistoryProps & { open: boolean; onClose: () => void }) {
  const title = `${{ purchase: "購入", cooking: "料理", meal: "食事" }[props.type]}履歴`;
  return (
    <FullScreenDialog
      open={open}
      onClose={() => {
        if (!props.saving) onClose();
      }}
      aria-labelledby={`all-${props.type}-history-title`}
      slotProps={{ paper: { className: "full-screen-dialog history-screen" } }}
    >
      <DialogTitle className="full-screen-heading">
        <span id={`all-${props.type}-history-title`}>{title}</span>
        <IconButton
          aria-label="履歴を閉じる"
          onClick={onClose}
          disabled={props.saving}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon>
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6-5.6 5.6L5 17.6l5.6-5.6L5 6.4z" />
          </SvgIcon>
        </IconButton>
      </DialogTitle>
      <DialogContent className="full-screen-content">
        <History {...props} all />
      </DialogContent>
    </FullScreenDialog>
  );
}
