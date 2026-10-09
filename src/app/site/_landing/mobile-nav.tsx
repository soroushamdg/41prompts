"use client";
import { useEffect, useRef } from "react";
import { Icon } from "@/components/icon";
import { cx } from "@/lib/cx";
import s from "../landing.module.css";

export type NavLink = { href: string; label: string };

/* The phone menu: a <details> that closes after a link is chosen, on an
   outside click, or on Escape (then refocuses its summary). */
export function MobileNav({ links }: { links: ReadonlyArray<NavLink> }) {
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
    <details className={s.mnav} ref={ref}>
      <summary className="btn btn--sm btn--icon" aria-label="Menu">
        <Icon name="sliders" />
      </summary>
      <nav
        className={cx(s.mnavPanel, "frame")}
        aria-label="Main, mobile"
        onClick={(e) => {
          if ((e.target as HTMLElement).closest("a") && ref.current) ref.current.open = false;
        }}
      >
        {links.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </nav>
    </details>
  );
}
