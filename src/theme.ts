import type {} from "@mui/material/themeCssVarsAugmentation";
import { createTheme } from "@mui/material/styles";

// A shared root attribute switches MUI, plain CSS, and the brand together.
// ThemeProvider defaults to the OS and persists an explicit user selection.
export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data-mui-color-scheme" },
  colorSchemes: {
    light: {
      palette: {
        primary: { main: "#3f6212", dark: "#324e0e", contrastText: "#ffffff" },
        background: { default: "#fafaf9", paper: "#ffffff" },
        text: { primary: "#1c1917", secondary: "#625d57" },
        divider: "#dedbd6",
        error: { main: "#9b2c20" },
      },
    },
    dark: {
      palette: {
        primary: { main: "#b2d783", dark: "#96bf64", contrastText: "#18230f" },
        background: { default: "#191c18", paper: "#242923" },
        text: { primary: "#eeeee8", secondary: "#b5bbae" },
        divider: "#454d41",
        error: { main: "#ffb4a5", contrastText: "#33120d" },
        action: {
          hover: "rgba(178, 215, 131, 0.08)",
          selected: "rgba(178, 215, 131, 0.14)",
          disabled: "#939b8d",
          disabledBackground: "#343b30",
        },
      },
    },
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
        outlined: { borderColor: "var(--mui-palette-divider)" },
      },
    },
    MuiTextField: {
      defaultProps: { size: "small", fullWidth: true, variant: "outlined" },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: "var(--mui-palette-background-paper)",
          minHeight: 44,
        },
        notchedOutline: {
          borderColor: "var(--mui-palette-text-secondary)",
          // WebKit can leave the legend's notch painted in the previous state.
          // Keep its layout visible; MUI still hides the duplicate text with
          // span opacity and controls the notch width from focus/value state.
          // https://github.com/mui/material-ui/issues/46891
          "@supports (-webkit-appearance: none)": {
            "& legend": { visibility: "visible" },
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        // Surface brightness provides hierarchy without MUI's elevation gradient.
        root: { backgroundImage: "none", boxShadow: "none" },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { border: "1px solid var(--mui-palette-divider)" },
      },
    },
    MuiMenu: {
      styleOverrides: {
        paper: { border: "1px solid var(--mui-palette-divider)" },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        ":root": {
          "--selected-background": "#eef2e7",
          "--notice-text": "#30480e",
          "--error-background": "#fdf1ed",
        },
        ':root[data-mui-color-scheme="dark"]': {
          "--selected-background": "#303e25",
          "--notice-text": "#cce7ad",
          "--error-background": "#3c2824",
        },
        body: { fontVariantNumeric: "tabular-nums" },
      },
    },
  },
});
