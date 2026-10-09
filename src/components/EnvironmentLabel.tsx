import { useEffect, useState } from "react";

type Environment = { environment: string; branch: string | null };
let request: Promise<Environment | null> | undefined;

export function EnvironmentLabel() {
  const [value, setValue] = useState<Environment | null>(null);
  useEffect(() => {
    let active = true;
    request ??= fetch("/api/environment")
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    void request.then((result) => {
      if (active) setValue(result);
    });
    return () => {
      active = false;
    };
  }, []);
  if (value?.environment !== "preview" && value?.environment !== "staging")
    return null;
  const label =
    value.environment === "staging"
      ? "ステージング"
      : `プレビュー${value.branch ? ` · ${value.branch}` : ""}`;
  return (
    <span
      className={`environment-label environment-${value.environment}`}
      title={label}
    >
      {label}
    </span>
  );
}
