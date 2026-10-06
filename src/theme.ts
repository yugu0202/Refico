import { createTheme } from "@mui/material/styles";
export const theme = createTheme({
  palette: {
    primary: { main: "#3f6212", dark: "#324e0e", contrastText: "#ffffff" },
    background: { default: "#fafaf9", paper: "#ffffff" },
    text: { primary: "#1c1917", secondary: "#625d57" },
    divider: "#dedbd6",
  },
  typography: {
    fontFamily:
      'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans JP", sans-serif',
    button: { textTransform: "none", fontWeight: 600, fontSize: "0.875rem" },
  },
  shape: { borderRadius: 5 },
  components: {
    MuiButton: {
      defaultProps: {
        disableElevation: true,
        disableRipple: true,
        variant: "outlined",
      },
      styleOverrides: {
        root: { minHeight: 44 },
        outlined: { borderColor: "#dedbd6" },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small", fullWidth: true, variant: "outlined" },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { backgroundColor: "#ffffff", minHeight: 44 } },
    },
    MuiCssBaseline: {
      styleOverrides: { body: { fontVariantNumeric: "tabular-nums" } },
    },
  },
});
