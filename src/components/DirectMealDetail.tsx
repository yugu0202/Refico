import { money } from "../format";
import type { Meal } from "../domain/inventory";
import { HistoryDetailRow } from "./HistoryDetailRow";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  return (
    <HistoryDetailRow value={money(direct.cost)}>
      <span>{direct.note || "金額入力"}</span>
      {direct.place && (
        <span className="direct-meal-place"> - {direct.place}</span>
      )}
    </HistoryDetailRow>
  );
}
