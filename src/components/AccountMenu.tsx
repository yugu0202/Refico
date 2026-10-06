import { useId, useRef, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
  user: { name: string; email: string } | null;
  canLogout: boolean;
  busy: boolean;
  onLogout: () => Promise<void>;
}

export function AccountMenu({ user, canLogout, busy, onLogout }: Props) {
  const panelId = useId();
  const titleId = useId();
  const mobile = useMediaQuery("(max-width: 600px)");
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const loggingOutRef = useRef(false);
  const [error, setError] = useState("");
  const open = Boolean(anchor);
  function close() {
    setAnchor(null);
  }
  async function logout() {
    if (busy || loggingOutRef.current) return;
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
    <Stack sx={{ minHeight: "100%" }}>
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
          アカウント
        </Typography>
        <IconButton
          aria-label="アカウント設定を閉じる"
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
      {user && (
        <Box sx={{ mb: 3, overflowWrap: "anywhere" }}>
          <Typography sx={{ fontWeight: 600 }}>{user.name}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {user.email}
          </Typography>
        </Box>
      )}
      <Divider />
      {/* Invitations and household sharing are not implemented yet. */}
      <Box sx={{ py: 2.5 }}>
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1 }}
        >
          共有設定
        </Typography>
        <Typography variant="body2" color="text.secondary">
          現在は共有に対応していません。
        </Typography>
      </Box>
      <Divider />
      <Box sx={{ py: 2.5 }}>
        <Typography
          component="h3"
          variant="body2"
          sx={{ fontWeight: 600, mb: 1.5 }}
        >
          テーマ
        </Typography>
        <ThemeControl inline />
      </Box>
      {canLogout && (
        <Box sx={{ mt: "auto", pt: 3 }}>
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
            disabled={busy || loggingOut}
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
      <Tooltip title="アカウント設定">
        <IconButton
          aria-label="アカウント設定を開く"
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
