import Button from "@mui/material/Button";

interface Props {
  loading: boolean;
  signingIn: boolean;
  canLogin: boolean;
  error: string;
  onLogin: () => void;
  onRetry?: () => void;
}

export function LoginScreen({
  loading,
  signingIn,
  canLogin,
  error,
  onLogin,
  onRetry,
}: Props) {
  return (
    <main className="login-screen">
      <div className="login-content">
        <h1 className="brand">Refico</h1>
        {loading ? (
          <p className="hint" role="status">
            読み込み中…
          </p>
        ) : (
          <>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {canLogin && (
              <Button fullWidth disabled={signingIn} onClick={onLogin}>
                {signingIn ? "ログイン中…" : "Googleでログイン"}
              </Button>
            )}
            {onRetry && (
              <Button fullWidth onClick={onRetry}>
                再読み込み
              </Button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
