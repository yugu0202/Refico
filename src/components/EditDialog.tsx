import { useEffect, useRef } from "react";
import Dialog, { type DialogProps } from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import SvgIcon from "@mui/material/SvgIcon";
import useMediaQuery from "@mui/material/useMediaQuery";

const editors: string[] = [];
let closingNavigations = 0;
// Editor history entries change neither the main tab nor its drafts/notices.
export function consumeEditNavigation() {
  if (closingNavigations > 0) {
    --closingNavigations;
    return true;
  }
  return editors.length > 0;
}

// Keep MUI's focus trap/restoration and the mounted background forms.
export function EditDialog(props: DialogProps) {
  const mobile = useMediaQuery("(max-width: 600px)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const paper = useRef<HTMLDivElement>(null);
  const close = useRef(props.onClose);
  close.current = props.onClose;
  useEffect(() => {
    if (!props.open) return;
    const token = crypto.randomUUID();
    const previous = window.history.state;
    const mark = () =>
      window.history.pushState({ ...previous, reficoEdit: token }, "");
    let mounted = true;
    let marked = false;
    queueMicrotask(() => {
      if (!mounted) return;
      mark();
      marked = true;
      editors.push(token);
    });
    const back = (event: PopStateEvent) => {
      if (editors.at(-1) !== token || event.state?.reficoEdit === token) return;
      // Invoke the existing saving guard. A prevented close keeps the history
      // entry until the dialog actually unmounts/closes.
      mark();
      close.current?.(event, "escapeKeyDown");
    };
    window.addEventListener("popstate", back);
    return () => {
      mounted = false;
      const index = editors.indexOf(token);
      if (index !== -1) editors.splice(index, 1);
      window.removeEventListener("popstate", back);
      if (marked && window.history.state?.reficoEdit === token) {
        ++closingNavigations;
        window.history.back();
      }
    };
  }, [props.open]);
  useEffect(() => {
    if (!props.open || !mobile || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      paper.current?.style.setProperty("--edit-height", `${viewport.height}px`);
      paper.current?.style.setProperty("--edit-top", `${viewport.offsetTop}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      paper.current?.style.removeProperty("--edit-height");
      paper.current?.style.removeProperty("--edit-top");
    };
  }, [props.open, mobile]);
  return (
    <Dialog
      {...props}
      fullScreen={mobile}
      fullWidth
      maxWidth={props.maxWidth ?? "sm"}
      transitionDuration={reducedMotion ? 0 : undefined}
      slotProps={{ paper: { ref: paper, className: "edit-dialog" } }}
    />
  );
}

export function EditDialogHeading({
  id,
  children,
  onClose,
  disabled = false,
}: {
  id: string;
  children: React.ReactNode;
  onClose: () => void;
  disabled?: boolean;
}) {
  return (
    <DialogTitle className="full-screen-heading">
      <span id={id}>{children}</span>
      <IconButton
        aria-label="入力を閉じる"
        disabled={disabled}
        onClick={onClose}
      >
        <SvgIcon>
          <path d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6-5.6 5.6L5 17.6l5.6-5.6L5 6.4z" />
        </SvgIcon>
      </IconButton>
    </DialogTitle>
  );
}
