import type { Meal } from "../domain/inventory";
import { money } from "../format";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  return (
    <>
      <div className="direct-meal-detail">
        <span>{direct.place || "金額入力"}</span>
        <span>{money(direct.cost)}</span>
      </div>
      {direct.note && <p className="meal-note">{direct.note}</p>}
    </>
  );
}
