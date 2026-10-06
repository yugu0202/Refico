import { useEffect } from "react";
import { useColorScheme } from "@mui/material/styles";
import { theme } from "../theme";

// Keep browser chrome in sync even while the account panel is closed.
export function ThemeMetadata() {
  const { mode, systemMode } = useColorScheme();
  const effectiveMode = mode === "system" ? systemMode : mode;
  useEffect(() => {
    if (!effectiveMode) return;
    document.documentElement.style.colorScheme = effectiveMode;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        theme.colorSchemes![effectiveMode]!.palette.background.default,
      );
  }, [effectiveMode]);
  return null;
}
