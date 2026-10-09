"use client";
import { createContext, createElement, useContext, useEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { countTo, formatCount, type CountOptions } from "./count-to";
import { revealClass, useReveal, type RevealKind } from "./use-reveal";

/* Section reveals: rise 18px and fade, once (DESIGN.md §8). <Reveal> is the
   [data-reveal] element; <Count> is [data-count-to], which counts up when
   its nearest <Reveal> comes into view. */

const RevealedContext = createContext(true);

/** Whether the nearest <Reveal> has come into view (true outside any). */
export function useRevealed(): boolean {
  return useContext(RevealedContext);
}

type RevealTag = "div" | "header" | "article" | "li" | "section" | "p" | "figure";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  as?: RevealTag;
  kind?: RevealKind;
  delay?: number;
  onReveal?: () => void;
};

export function Reveal({ as = "div", kind = "up", delay = 0, onReveal, className, children, ...rest }: RevealProps) {
  const { ref, revealed } = useReveal<HTMLElement>({ delay, onReveal });
  return createElement(
    as,
    { ...rest, ref, className: cx(className, revealClass(kind, revealed)), "data-reveal": kind },
    <RevealedContext value={revealed}>{children}</RevealedContext>,
  );
}

/** Provides an already-tracked reveal state to <Count> children. */
export function RevealedProvider({ revealed, children }: { revealed: boolean; children: React.ReactNode }) {
  return <RevealedContext value={revealed}>{children}</RevealedContext>;
}

type CountProps = CountOptions & { to: number; delay?: number; className?: string };

export function Count({ to, delay = 0, className, ...opts }: CountProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const revealed = useRevealed();
  const { decimals, prefix, suffix, ms } = opts;
  useEffect(() => {
    const el = ref.current;
    if (!revealed || !el) return;
    let cancel = () => {};
    const timer = window.setTimeout(() => {
      cancel = countTo(el, to, { decimals, prefix, suffix, ms });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancel();
    };
  }, [revealed, to, delay, decimals, prefix, suffix, ms]);
  return (
    <span ref={ref} className={className}>
      {formatCount(to, opts)}
    </span>
  );
}
