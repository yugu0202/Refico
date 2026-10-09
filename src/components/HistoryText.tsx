import { useEffect, useRef, useState, type ReactNode } from "react";

/** Shared overflow behavior for history names, notes and detail descriptions. */
export function HistoryText({ children }: { children: ReactNode }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  useEffect(() => {
    if (expanded) return;
    const text = textRef.current;
    if (!text) return;
    const measure = () => setTruncated(text.scrollWidth > text.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(text);
    return () => observer.disconnect();
  }, [children, expanded]);
  const interactive = truncated || expanded;
  return (
    <span
      ref={textRef}
      className={`history-text${expanded ? " is-expanded" : ""}`}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-expanded={interactive ? expanded : undefined}
      onClick={(event) => {
        if (!interactive) return;
        // A truncated title inside summary expands independently of its details.
        event.preventDefault();
        event.stopPropagation();
        setExpanded((value) => !value);
      }}
      onKeyDown={(event) => {
        if (!interactive || (event.key !== "Enter" && event.key !== " "))
          return;
        event.preventDefault();
        event.stopPropagation();
        setExpanded((value) => !value);
      }}
    >
      {children}
    </span>
  );
}
