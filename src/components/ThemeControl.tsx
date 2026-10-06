import { useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";

const options = [
  { value: "system", label: "端末設定" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
] as const;

export function ThemeControl({ inline = false }: { inline?: boolean }) {
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (inline)
    return (
      <ToggleButtonGroup
        exclusive
        value={mode ?? "system"}
        aria-label="テーマ"
        onChange={(_, next: "system" | "light" | "dark" | null) => {
          if (next) setMode(next);
        }}
        sx={{ width: "100%" }}
      >
        {options.map((option) => (
          <ToggleButton
            key={option.value}
            value={option.value}
            sx={{
              flex: 1,
              minHeight: 44,
              px: 1,
              textTransform: "none",
              "&.Mui-selected": { fontWeight: 700 },
            }}
          >
            {option.label}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    );
  return (
    <>
      <Tooltip title="テーマ">
        <IconButton
          aria-label="テーマ"
          aria-haspopup="menu"
          aria-controls={anchor ? "theme-menu" : undefined}
          aria-expanded={Boolean(anchor)}
          onClick={(event) => setAnchor(event.currentTarget)}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon
            sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" />
          </SvgIcon>
        </IconButton>
      </Tooltip>
      <Menu
        id="theme-menu"
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        slotProps={{ list: { "aria-label": "テーマ" } }}
      >
        {options.map((option) => (
          <MenuItem
            key={option.value}
            role="menuitemradio"
            aria-checked={mode === option.value}
            selected={mode === option.value}
            onClick={() => {
              setMode(option.value);
              setAnchor(null);
            }}
            sx={{ minHeight: 44, minWidth: 144, gap: 2 }}
          >
            <span aria-hidden="true" style={{ width: 16 }}>
              {mode === option.value ? "✓" : ""}
            </span>
            {option.label}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
