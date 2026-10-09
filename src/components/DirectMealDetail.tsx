import type { Meal } from "../domain/inventory";
import { money } from "../format";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  return (
    <div className="direct-meal-detail">
      <span className="direct-meal-description">
        <span className="direct-meal-content">{direct.note || "金額入力"}</span>
        {direct.place && (
          <span className="direct-meal-place">{direct.place}</span>
        )}
      </span>
      <span>{money(direct.cost)}</span>
    </div>
  );
}
