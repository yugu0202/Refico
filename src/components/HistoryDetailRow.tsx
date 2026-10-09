import type { ReactNode } from "react";
import { HistoryText } from "./HistoryText";

export function HistoryDetailRow({
  children,
  value,
}: {
  children: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="history-detail-row">
      <HistoryText>{children}</HistoryText>
      <span>
        <HistoryText>{value}</HistoryText>
      </span>
    </div>
  );
}
