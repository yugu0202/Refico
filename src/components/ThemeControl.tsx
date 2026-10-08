import { useId, useRef, useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import Box from "@mui/material/Box";
import Collapse from "@mui/material/Collapse";
import Typography from "@mui/material/Typography";

const options = [
  { value: "system", label: "端末設定" },
  { value: "light", label: "ライト" },
  { value: "dark", label: "ダーク" },
] as const;

export function ThemeControl({ inline = false }: { inline?: boolean }) {
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const choicesId = useId();
  const choiceRef = useRef<HTMLButtonElement>(null);
  const currentMode = mode ?? "system";
  if (inline)
    return (
      <>
        <Button
          ref={choiceRef}
          fullWidth
          variant="text"
          aria-expanded={choicesOpen}
          aria-controls={choicesId}
          onClick={() => setChoicesOpen((value) => !value)}
          sx={{
            justifyContent: "space-between",
            minHeight: 44,
            px: 0,
            gap: 1,
            color: "text.primary",
            textAlign: "left",
          }}
        >
          <Box component="span">
            <Typography
              component="span"
              variant="body2"
              sx={{ display: "block" }}
            >
              テーマ
            </Typography>
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ display: "block" }}
            >
              {options.find((option) => option.value === currentMode)?.label}
            </Typography>
          </Box>
          <SvgIcon
            sx={{
              flexShrink: 0,
              fill: "none",
              stroke: "currentColor",
              strokeWidth: 1.8,
              transform: choicesOpen ? "rotate(180deg)" : "none",
            }}
          >
            <path
              d="m6 9 6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </SvgIcon>
        </Button>
        <Collapse in={choicesOpen} id={choicesId}>
          <Stack role="group" aria-label="テーマ">
            {options.map((option) => (
              <Button
                key={option.value}
                fullWidth
                variant="text"
                aria-pressed={currentMode === option.value}
                onClick={() => {
                  setMode(option.value);
                  setChoicesOpen(false);
                  choiceRef.current?.focus();
                }}
                sx={{
                  justifyContent: "space-between",
                  minHeight: 44,
                  color: "text.primary",
                  fontWeight: currentMode === option.value ? 650 : 400,
                }}
              >
                {option.label}
                <span aria-hidden="true">
                  {currentMode === option.value ? "✓" : ""}
                </span>
              </Button>
            ))}
          </Stack>
        </Collapse>
      </>
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
