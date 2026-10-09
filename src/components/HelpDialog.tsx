import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import { FullScreenDialog } from "./FullScreenDialog";
import { HelpPage } from "./HelpPage";
import { EnvironmentLabel } from "./EnvironmentLabel";
import type { HelpPageId } from "../help";

export function HelpDialog({
  open,
  page,
  onBack,
  onClose,
  onNavigate,
}: {
  open: boolean;
  page: HelpPageId;
  onBack: () => void;
  onClose: () => void;
  onNavigate: (page: HelpPageId) => void;
}) {
  return (
    <FullScreenDialog
      open={open}
      onClose={onClose}
      aria-labelledby="help-screen-title"
      slotProps={{ paper: { className: "full-screen-dialog help-screen" } }}
    >
      <DialogTitle className="full-screen-heading">
        <span>
          {page !== "help" && (
            <IconButton
              aria-label="使い方の一覧に戻る"
              onClick={onBack}
              sx={{ width: 44, height: 44, mr: 1 }}
            >
              <SvgIcon>
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20z" />
              </SvgIcon>
            </IconButton>
          )}
          <span className="brand-name">
            <span id="help-screen-title" tabIndex={-1}>
              使い方
            </span>
            <EnvironmentLabel />
          </span>
        </span>
        <IconButton
          aria-label="使い方を閉じる"
          onClick={onClose}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon>
            <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6-5.6 5.6L5 17.6l5.6-5.6L5 6.4z" />
          </SvgIcon>
        </IconButton>
      </DialogTitle>
      <DialogContent className="full-screen-content">
        <HelpPage
          embedded
          page={page}
          onBack={onBack}
          onNavigate={onNavigate}
        />
      </DialogContent>
    </FullScreenDialog>
  );
}
