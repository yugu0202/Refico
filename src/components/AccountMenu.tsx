import type { Space } from "../api";
import type { SpaceDetails } from "./SpaceSettings";
import { useEffect, useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Popover from "@mui/material/Popover";
import Stack from "@mui/material/Stack";
import SvgIcon from "@mui/material/SvgIcon";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { ThemeControl } from "./ThemeControl";

interface Props {
  spaces: Space[];
  spaceId: string;
  onSwitch: (id: string) => Promise<void>;
  onPrepareSettings: () => Promise<SpaceDetails>;
  onSettings: (details: SpaceDetails) => void;
  user: { name: string; email: string } | null;
  canLogout: boolean;
  busy: boolean;
  onLogout: () => Promise<void>;
  onHelp: () => void;
  reopen: boolean;
  onClosed: () => void;
}

export function AccountMenu({
  spaces,
  spaceId,
  onSwitch,
  onSettings,
  onPrepareSettings,
  user,
  canLogout,
  busy,
  onLogout,
  onHelp,
  reopen,
  onClosed,
}: Props) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const titleId = useId();
  const mobile = useMediaQuery("(max-width: 600px)");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);
  const [error, setError] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const settingsPending = useRef(false);
  const settingsGeneration = useRef(0);
  useEffect(
    () => () => {
      ++settingsGeneration.current;
    },
    [],
  );
  const open = Boolean(anchor);
  useEffect(() => {
    if (reopen) setAnchor(triggerRef.current);
  }, [reopen]);
  function close() {
    ++settingsGeneration.current;
    settingsPending.current = false;
    setSettingsLoading(false);
    setAnchor(null);
    onClosed();
  }
  async function openSettings() {
    if (busy || loggingOutRef.current || settingsPending.current) return;
    settingsPending.current = true;
    const generation = ++settingsGeneration.current;
    setSettingsLoading(true);
    setError("");
    try {
      const details = await onPrepareSettings();
      if (generation !== settingsGeneration.current) return;
      close();
      onSettings(details);
    } catch (e) {
      if (generation === settingsGeneration.current)
        setError(e instanceof Error ? e.message : "設定を読み込めませんでした");
    } finally {
      if (generation === settingsGeneration.current) {
        settingsPending.current = false;
        setSettingsLoading(false);
      }
    }
  }
  async function logout() {
    if (busy || loggingOutRef.current || settingsPending.current) return;
    loggingOutRef.current = true;
    setLoggingOut(true);
    setError("");
    try {
      await onLogout();
      close();
    } catch {
      setError("ログアウトできませんでした。もう一度お試しください。");
    } finally {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }
  const content = (
    <Stack>
      <Stack
        direction="row"
        sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}
      >
        <Typography
          id={titleId}
          component="h2"
          variant="subtitle1"
          sx={{ fontWeight: 650 }}
        >
          メニュー
        </Typography>
        <IconButton
          aria-label="メニューを閉じる"
          onClick={close}
          sx={{ width: 44, height: 44 }}
        >
          <SvgIcon
            sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
          >
            <path d="m6 6 12 12M18 6 6 18" strokeLinecap="round" />
          </SvgIcon>
        </IconButton>
      </Stack>
      <Box
        component="section"
        sx={{ mb: 0, pb: 2.5, overflowWrap: "anywhere" }}
      >
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1.5 }}
        >
          アカウント
        </Typography>
        {user && (
          <>
            <Typography sx={{ fontWeight: 600 }}>{user.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {user.email}
            </Typography>
          </>
        )}
      </Box>
      <Divider />

      <Box component="section" sx={{ py: 2.5, mb: 0 }}>
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1.5 }}
        >
          スペース
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          使用するスペース
        </Typography>
        {spaces.map((space) => (
          <Button
            key={space.id}
            fullWidth
            variant="text"
            disabled={busy || loggingOut || settingsLoading}
            aria-pressed={space.id === spaceId}
            sx={{
              justifyContent: "space-between",
              minHeight: 44,
              color: "text.primary",
              fontWeight: space.id === spaceId ? 650 : 400,
            }}
            onClick={async () => {
              setError("");
              try {
                await onSwitch(space.id);
                close();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "切り替えできませんでした",
                );
              }
            }}
          >
            {space.name}
            <span aria-hidden="true">{space.id === spaceId ? "✓" : ""}</span>
          </Button>
        ))}
        <Button
          fullWidth
          variant="text"
          disabled={busy || loggingOut || settingsLoading}
          sx={{
            justifyContent: "space-between",
            minHeight: 44,
            px: 0,
            color: "text.primary",
          }}
          onClick={() => void openSettings()}
          aria-busy={settingsLoading}
        >
          共有・スペースの設定
          {settingsLoading ? (
            <CircularProgress
              size={16}
              color="inherit"
              aria-label="読み込み中"
            />
          ) : (
            <span aria-hidden="true">›</span>
          )}
        </Button>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </Box>
      <Divider />
      <Box component="section" sx={{ py: 2.5, mb: 0 }}>
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1 }}
        >
          サポート
        </Typography>
        <Button
          component="a"
          href="/help"
          variant="text"
          fullWidth
          disabled={busy || loggingOut || settingsLoading}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            )
              return;
            event.preventDefault();
            close();
            onHelp();
          }}
          sx={{
            justifyContent: "space-between",
            minHeight: 44,
            px: 0,
            color: "text.primary",
          }}
        >
          使い方 <span aria-hidden="true">›</span>
        </Button>
      </Box>
      <Divider />
      <Box component="section" sx={{ py: 2.5, mb: 0 }}>
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1.5 }}
        >
          表示
        </Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          テーマ
        </Typography>
        <ThemeControl inline />
      </Box>
      {canLogout && (
        <Box sx={{ pt: 3 }}>
          <Divider sx={{ mb: 2 }} />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <Button
            fullWidth
            color="error"
            variant="text"
            disabled={busy || loggingOut || settingsLoading}
            onClick={() => void logout()}
          >
            {loggingOut ? "ログアウト中…" : "ログアウト"}
          </Button>
        </Box>
      )}
    </Stack>
  );
  return (
    <>
      <Tooltip title="メニュー">
        <IconButton
          ref={triggerRef}
          aria-label="メニューを開く"
          aria-haspopup="dialog"
          aria-controls={open ? panelId : undefined}
          aria-expanded={open}
          onClick={(event) => {
            setError("");
            setAnchor(event.currentTarget);
          }}
          sx={{ width: 44, height: 44, flexShrink: 0 }}
        >
          <SvgIcon
            sx={{ fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}
          >
            <circle cx="12" cy="8" r="4" />
            <path
              d="M4 21v-2a8 8 0 0 1 16 0v2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </SvgIcon>
        </IconButton>
      </Tooltip>
      {mobile ? (
        <Drawer
          anchor="right"
          open={open}
          onClose={close}
          slotProps={{
            paper: {
              id: panelId,
              role: "dialog",
              "aria-modal": true,
              "aria-labelledby": titleId,
              sx: {
                width: "min(340px, calc(100vw - 32px))",
                p: 2.5,
                pt: "max(20px, env(safe-area-inset-top))",
                pr: "max(20px, env(safe-area-inset-right))",
                pb: "max(20px, env(safe-area-inset-bottom))",
                borderLeft: 1,
                borderColor: "divider",
                display: "block",
              },
            },
          }}
        >
          {content}
        </Drawer>
      ) : (
        <Popover
          open={open}
          anchorEl={anchor}
          onClose={close}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
          transformOrigin={{ vertical: "top", horizontal: "right" }}
          slotProps={{
            paper: {
              id: panelId,
              role: "dialog",
              "aria-modal": true,
              "aria-labelledby": titleId,
              sx: {
                width: 340,
                maxWidth: "calc(100vw - 32px)",
                p: 2.5,
                mt: 1,
                border: 1,
                borderColor: "divider",
              },
            },
          }}
        >
          {content}
        </Popover>
      )}
    </>
  );
}
