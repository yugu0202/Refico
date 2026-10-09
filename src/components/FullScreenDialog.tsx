import { forwardRef } from "react";
import Dialog, { type DialogProps } from "@mui/material/Dialog";
import Slide, { type SlideProps } from "@mui/material/Slide";
import useMediaQuery from "@mui/material/useMediaQuery";

const UpTransition = forwardRef<unknown, SlideProps>(
  function UpTransition(props, ref) {
    return <Slide direction="up" ref={ref} {...props} />;
  },
);

export function FullScreenDialog(props: DialogProps) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <Dialog
      {...props}
      fullScreen
      slots={{ ...props.slots, transition: UpTransition }}
      transitionDuration={reducedMotion ? 0 : props.transitionDuration}
    />
  );
}
