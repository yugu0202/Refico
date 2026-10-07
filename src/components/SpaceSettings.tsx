import { useEffect, useRef, useState } from "react";
import {
  Alert,
  CircularProgress,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Snackbar,
  SvgIcon,
  Stack,
  TextField,
  Typography,
  Tooltip,
} from "@mui/material";
import { sharingRequest, type Space } from "../api";
export interface SpaceDetails {
  members: { id: string; name: string; role: string }[];
  invitations: { id: string; expiresAt: number }[];
}
export function SpaceSettings({
  space,
  initialDetails,
  onClose,
  onChanged,
}: {
  space: Space;
  initialDetails: SpaceDetails;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [details, setDetails] = useState(initialDetails);
  const [name, setName] = useState(space.name);
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  const [error, setError] = useState("");
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [invite, setInvite] = useState<{ id: string; link: string } | null>(
    null,
  );
  const [confirm, setConfirm] = useState<{
    type: string;
    userId?: string;
    label: string;
  } | null>(null);
  async function copyLink() {
    if (!invite || copying || busy) return;
    const link = invite.link;
    setCopying(true);
    setCopiedLink(null);
    try {
      await navigator.clipboard.writeText(link);
      setCopiedLink(link);
    } catch {
      setError("リンクを選択してコピーしてください");
    } finally {
      setCopying(false);
    }
  }
  async function load() {
    setDetails(
      await sharingRequest<SpaceDetails>(
        "/api/spaces/details",
        undefined,
        space.id,
      ),
    );
  }
  async function act(body: unknown) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await sharingRequest<{ token?: string }>(
        "/api/spaces",
        body,
        space.id,
      );
      if (result.token) {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(result.token),
        );
        const id = Array.from(new Uint8Array(digest), (b) =>
          b.toString(16).padStart(2, "0"),
        ).join("");
        setInvite({
          id,
          link: `${window.location.origin}/invitations/${result.token}`,
        });
      }
      const action = body as { type: string; invitationId?: string };
      if (action.type === "revoke") {
        // Only invitation availability changes. Apply the confirmed result
        // without refetching inventory, memberships, or the settings list.
        setDetails((current) => ({
          ...current,
          invitations: current.invitations.filter(
            (invitation) => invitation.id !== action.invitationId,
          ),
        }));
        if (action.invitationId === invite?.id) {
          setInvite(null);
          setCopiedLink(null);
        }
      } else {
        await onChanged();
        if (action.type === "leave") onClose();
        else await load();
      }
      setConfirm(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存できませんでした");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      fullWidth
      maxWidth="sm"
      onClose={() => {
        if (!busy) onClose();
      }}
      aria-labelledby="space-settings-title"
    >
      <DialogTitle id="space-settings-title">スペースの設定</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {space.role === "owner" ? (
            <Stack
              component="form"
              spacing={1}
              onSubmit={(e) => {
                e.preventDefault();
                void act({ type: "rename", name });
              }}
            >
              <TextField
                label="スペース名"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                slotProps={{ htmlInput: { maxLength: 80 } }}
              />
              <Button
                type="submit"
                disabled={busy || !name.trim() || name.trim() === space.name}
              >
                名前を保存
              </Button>
            </Stack>
          ) : (
            <Typography>{space.name}</Typography>
          )}
          <Typography component="h3" variant="subtitle1">
            メンバー
          </Typography>
          {details?.members.map((m) => (
            <Stack
              direction="row"
              key={m.id}
              sx={{ alignItems: "center", justifyContent: "space-between" }}
            >
              <Typography sx={{ overflowWrap: "anywhere" }}>
                {m.name}
                {m.role === "owner" ? "（オーナー）" : ""}
              </Typography>
              {space.role === "owner" && m.role === "member" && (
                <Button
                  color="error"
                  disabled={busy}
                  onClick={() =>
                    setConfirm({
                      type: "remove",
                      userId: m.id,
                      label: `${m.name}をメンバーから削除しますか？`,
                    })
                  }
                >
                  削除
                </Button>
              )}
            </Stack>
          ))}
          {space.role === "owner" && (
            <>
              <Button
                variant="contained"
                disabled={busy}
                onClick={() => void act({ type: "invite" })}
              >
                メンバーを招待
              </Button>
              {invite && (
                <>
                  <TextField
                    label="招待リンク"
                    value={invite.link}
                    slotProps={{
                      htmlInput: { readOnly: true },
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <Tooltip
                              title={
                                copiedLink === invite.link
                                  ? "コピーしました"
                                  : "リンクをコピー"
                              }
                            >
                              <span>
                                <IconButton
                                  aria-label="招待リンクをコピー"
                                  disabled={busy || copying}
                                  onClick={() => void copyLink()}
                                  sx={{ width: 44, height: 44 }}
                                >
                                  <SvgIcon
                                    sx={{
                                      fill: "none",
                                      stroke: "currentColor",
                                      strokeWidth: 1.8,
                                    }}
                                  >
                                    {copiedLink === invite.link ? (
                                      <path
                                        d="m5 12 4 4L19 6"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      />
                                    ) : (
                                      <>
                                        <rect
                                          x="8"
                                          y="8"
                                          width="12"
                                          height="12"
                                          rx="2"
                                        />
                                        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
                                      </>
                                    )}
                                  </SvgIcon>
                                </IconButton>
                              </span>
                            </Tooltip>
                          </InputAdornment>
                        ),
                      },
                    }}
                  />
                  <Typography variant="body2" color="text.secondary">
                    7日間有効・1人だけ参加できます。
                  </Typography>
                </>
              )}
              {details?.invitations.map((i) => (
                <Stack
                  key={i.id}
                  direction="row"
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                >
                  <Typography variant="body2">
                    {new Date(i.expiresAt * 1000).toLocaleDateString("ja-JP")}
                    までの招待
                  </Typography>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void act({ type: "revoke", invitationId: i.id })
                    }
                  >
                    無効にする
                  </Button>
                </Stack>
              ))}
            </>
          )}
          {space.role === "member" && (
            <Button
              color="error"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  type: "leave",
                  label: "このスペースから退出しますか？",
                })
              }
            >
              スペースから退出
            </Button>
          )}
          {confirm && (
            <Alert severity="warning">
              <Typography>{confirm.label}</Typography>
              <Button
                color="error"
                disabled={busy}
                onClick={() =>
                  void act({ type: confirm.type, userId: confirm.userId })
                }
              >
                確定
              </Button>
              <Button disabled={busy} onClick={() => setConfirm(null)}>
                キャンセル
              </Button>
            </Alert>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onClose}>
          閉じる
        </Button>
      </DialogActions>
      <Snackbar
        open={!!invite && copiedLink === invite.link}
        message="コピーしました"
        autoHideDuration={2500}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setCopiedLink(null);
        }}
      />
    </Dialog>
  );
}
export function Invitation({
  token,
  onAccepted,
  onCancel,
}: {
  token: string;
  onAccepted: () => Promise<void>;
  onCancel: () => void;
}) {
  const [info, setInfo] = useState<{ name: string }>();
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const guard = useRef(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setInfo(undefined);
    setError("");
    void sharingRequest<{ name: string }>(`/api/invitations/${token}`)
      .then((value) => {
        if (active) setInfo(value);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "招待を確認できませんでした",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, retry]);
  return (
    <Dialog open fullWidth maxWidth="sm" aria-labelledby="invite-title">
      <DialogTitle id="invite-title">スペースへの招待</DialogTitle>
      <DialogContent>
        {loading && (
          <Stack
            direction="row"
            spacing={1.5}
            sx={{ alignItems: "center", minHeight: 48 }}
            role="status"
          >
            <CircularProgress size={20} aria-hidden="true" />
            <Typography>招待を確認しています…</Typography>
          </Stack>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {!loading && !info && error && (
          <Button onClick={() => setRetry((value) => value + 1)}>再試行</Button>
        )}
        {info && <Typography>「{info.name}」に参加しますか？</Typography>}
      </DialogContent>
      <DialogActions>
        <Button disabled={busy} onClick={onCancel}>
          キャンセル
        </Button>
        <Button
          variant="contained"
          disabled={busy || loading || !info}
          onClick={async () => {
            if (guard.current) return;
            guard.current = true;
            setBusy(true);
            setError("");
            try {
              await sharingRequest(`/api/invitations/${token}`, {});
              await onAccepted();
            } catch (e) {
              setError(e instanceof Error ? e.message : "参加できませんでした");
            } finally {
              guard.current = false;
              setBusy(false);
            }
          }}
        >
          参加する
        </Button>
      </DialogActions>
    </Dialog>
  );
}
