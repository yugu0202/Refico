import type { Meal } from "../domain/inventory";
import { money } from "../format";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  return (
    <>
      <div>
        <span>{direct.place || "外食など"}</span>
        <span>{money(direct.cost)}</span>
      </div>
      {direct.note && <p className="meal-note">{direct.note}</p>}
    </>
  );
}
