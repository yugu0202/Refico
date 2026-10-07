import Portal from "@mui/material/Portal";
import Snackbar from "@mui/material/Snackbar";

export function Toast({
  open,
  message,
  version,
  onClose,
}: {
  open: boolean;
  message: string;
  version?: number;
  onClose: () => void;
}) {
  return (
    <Portal>
      <Snackbar
        key={version}
        open={open}
        message={message}
        autoHideDuration={2500}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        slotProps={{ content: { role: "status" } }}
        onClose={(_, reason) => {
          if (reason !== "clickaway") onClose();
        }}
        sx={{
          bottom: { xs: "calc(72px + env(safe-area-inset-bottom))", sm: 24 },
        }}
      />
    </Portal>
  );
}
