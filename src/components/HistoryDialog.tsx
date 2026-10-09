import { forwardRef } from "react";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Slide, { type SlideProps } from "@mui/material/Slide";
import SvgIcon from "@mui/material/SvgIcon";
import useMediaQuery from "@mui/material/useMediaQuery";
import { History, type HistoryProps } from "./History";

const HistoryTransition = forwardRef<unknown, SlideProps>(
  function HistoryTransition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
  },
);

export function HistoryDialog({
  open,
  onClose,
  ...props
}: HistoryProps & { open: boolean; onClose: () => void }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const title = `${{ purchase: "購入", cooking: "料理", meal: "食事" }[props.type]}履歴`;
  return (
    <Dialog
      open={open}
      fullScreen
      onClose={() => {
        if (!props.saving) onClose();
      }}
      aria-labelledby={`all-${props.type}-history-title`}
      slots={{ transition: HistoryTransition }}
      transitionDuration={reducedMotion ? 0 : undefined}
      slotProps={{ paper: { className: "history-screen" } }}
    >
      <DialogTitle className="history-screen-heading">
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
      <DialogContent className="history-screen-content">
        <History {...props} all />
      </DialogContent>
    </Dialog>
  );
}
