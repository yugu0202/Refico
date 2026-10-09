import { EnvironmentLabel } from "./EnvironmentLabel";
import { BrandLogo } from "./BrandLogo";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";

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
        <h1 className="brand">
          <BrandLogo size={40} />
          <span className="brand-name">
            Refico
            <EnvironmentLabel />
          </span>
        </h1>
        {loading ? (
          <div className="login-status" role="status">
            <CircularProgress size={20} aria-hidden="true" />
            <span>読み込み中…</span>
          </div>
        ) : (
          <>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            {canLogin && (
              <Button
                fullWidth
                variant="contained"
                disabled={signingIn}
                onClick={onLogin}
              >
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
