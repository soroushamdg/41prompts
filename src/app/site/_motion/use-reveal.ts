"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./reduced-motion";

/* [data-reveal] and BP.onReveal from docs/assets/js/motion.js. The element is
   rendered with the global .rv-pre class (hidden only once <html class="js">
   is set, so nothing is lost without scripts) and swaps to .rv-in the first
   time it enters the viewport, after `delay` ms. `onReveal` runs once at that
   moment. Under reduced motion everything counts as revealed at once. */

export type RevealKind = "up" | "fade" | "left" | "scale" | "none";

export function useReveal<T extends Element>({ delay = 0, onReveal }: { delay?: number; onReveal?: () => void } = {}) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  const reduce = usePrefersReducedMotion();
  const revealed = seen || reduce;
  const onRevealRef = useRef(onReveal);
  const fired = useRef(false);

  useEffect(() => {
    onRevealRef.current = onReveal;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    let timer = 0;
    if (typeof IntersectionObserver === "undefined") {
      timer = window.setTimeout(() => setSeen(true), 0);
      return () => window.clearTimeout(timer);
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((en) => en.isIntersecting)) return;
        io.disconnect();
        timer = window.setTimeout(() => setSeen(true), delay);
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [delay, reduce]);

  useEffect(() => {
    if (!revealed || fired.current) return;
    fired.current = true;
    onRevealRef.current?.();
  }, [revealed]);

  return { ref, revealed };
}

/** The global reveal class for an element: .rv-pre until revealed, then .rv-in.
    Kind "none" is only a trigger: it is never hidden. */
export function revealClass(kind: RevealKind, revealed: boolean): string | undefined {
  if (revealed) return "rv-in";
  return kind === "none" ? undefined : "rv-pre";
}
