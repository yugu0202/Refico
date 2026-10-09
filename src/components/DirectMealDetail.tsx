import type { Meal } from "../domain/inventory";
import { MealDetailRow } from "./MealDetailRow";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  return (
    <MealDetailRow amount={direct.cost}>
      <span>{direct.note || "金額入力"}</span>
      {direct.place && (
        <span className="direct-meal-place"> - {direct.place}</span>
      )}
    </MealDetailRow>
  );
}
