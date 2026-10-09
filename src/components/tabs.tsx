"use client";
import { useRef } from "react";
import { cx } from "@/lib/cx";

export type TabItem<T extends string> = { id: T; label: React.ReactNode };

type Props<T extends string> = {
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  idPrefix: string;
  variant?: "tabs" | "seg";
  className?: string;
};

/** role=tablist with roving tabindex and arrow-key navigation. Panels use
    id `${idPrefix}-panel-${id}` and are labelled by `${idPrefix}-tab-${id}`. */
export function TabList<T extends string>({ label, items, value, onChange, idPrefix, variant = "tabs", className }: Props<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  function move(i: number) {
    const n = (i + items.length) % items.length;
    refs.current[n]?.focus();
    onChange(items[n]!.id);
  }
  return (
    <div className={cx(variant, className)} role="tablist" aria-label={label}>
      {items.map((t, i) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${t.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            className={variant === "tabs" ? "tab" : undefined}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i + 1);
              else if (e.key === "ArrowLeft") move(i - 1);
              else if (e.key === "Home") move(0);
              else if (e.key === "End") move(items.length - 1);
              else return;
              e.preventDefault();
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, id, active, className, children }: { idPrefix: string; id: string; active: boolean; className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cx(className, active && "panel-in")}
      id={`${idPrefix}-panel-${id}`}
      role="tabpanel"
      aria-labelledby={`${idPrefix}-tab-${id}`}
      hidden={!active}
    >
      {children}
    </section>
  );
}
