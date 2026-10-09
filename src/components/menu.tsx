"use client";
import { useEffect, useRef } from "react";

type Props = { summary: React.ReactNode; summaryClassName?: string; summaryLabel: string; children: React.ReactNode };

/** details.menu that closes on an outside click or Escape (then refocuses its summary). */
export function Menu({ summary, summaryClassName, summaryLabel, children }: Props) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const d = ref.current;
      if (d?.open && !d.contains(e.target as Node)) d.open = false;
    }
    function onKey(e: KeyboardEvent) {
      const d = ref.current;
      if (e.key === "Escape" && d?.open) {
        d.open = false;
        d.querySelector("summary")?.focus();
      }
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  return (
    <details className="menu" ref={ref}>
      <summary className={summaryClassName} aria-label={summaryLabel}>
        {summary}
      </summary>
      <div
        className="menu__panel frame"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a, button") && ref.current) ref.current.open = false;
        }}
      >
        {children}
      </div>
    </details>
  );
}
