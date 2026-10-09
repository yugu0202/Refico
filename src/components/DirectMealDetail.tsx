import { useEffect, useRef, useState } from "react";
import type { Meal } from "../domain/inventory";
import { money } from "../format";

export function DirectMealDetail({
  direct,
}: {
  direct: NonNullable<Meal["direct"]>;
}) {
  const descriptionRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const description = descriptionRef.current;
    if (!description) return;
    const measure = () =>
      setTruncated(description.scrollWidth > description.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(description);
    return () => observer.disconnect();
  }, [direct.note, direct.place, expanded]);
  return (
    <button
      type="button"
      className={`direct-meal-detail${expanded ? " is-expanded" : ""}`}
      disabled={!truncated && !expanded}
      aria-expanded={truncated || expanded ? expanded : undefined}
      onClick={() => setExpanded((value) => !value)}
    >
      <span className="direct-meal-description" ref={descriptionRef}>
        <span className="direct-meal-content">{direct.note || "金額入力"}</span>
        {direct.place && (
          <span className="direct-meal-place"> - {direct.place}</span>
        )}
      </span>
      <span>{money(direct.cost)}</span>
    </button>
  );
}
