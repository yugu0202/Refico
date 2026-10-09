import { useEffect, useRef, useState, type ReactNode } from "react";
import { money } from "../format";

export function MealDetailRow({
  children,
  amount,
}: {
  children: ReactNode;
  amount: number;
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
  }, [children, expanded]);
  return (
    <button
      type="button"
      className={`meal-detail-row${expanded ? " is-expanded" : ""}`}
      disabled={!truncated && !expanded}
      aria-expanded={truncated || expanded ? expanded : undefined}
      onClick={() => setExpanded((value) => !value)}
    >
      <span className="meal-detail-description" ref={descriptionRef}>
        {children}
      </span>
      <span>{money(amount)}</span>
    </button>
  );
}
