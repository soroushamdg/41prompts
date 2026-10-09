"use client";
import { useCallback, useEffect, useRef, type RefObject } from "react";

/* BP.loop from docs/assets/js/motion.js: runs a timed sequence of [ms, fn]
   steps on repeat. A new cycle starts only while the host is on screen
   (15% visible) and the tab is visible; otherwise the loop rests and restarts
   from the top when it comes back. Off entirely when `enabled` is false
   (reduced motion). Returns `replay`, which restarts the sequence now. */

export type LoopStep = readonly [ms: number, run: () => void];

export function useLoop(host: RefObject<Element | null>, steps: ReadonlyArray<LoopStep>, period: number, enabled: boolean): () => void {
  const stepsRef = useRef(steps);
  const replayRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    stepsRef.current = steps;
  });

  useEffect(() => {
    const el = host.current;
    if (!enabled || !el) return;
    let timers: number[] = [];
    let visible = true;
    let running = false;
    const clear = () => {
      timers.forEach((t) => window.clearTimeout(t));
      timers = [];
    };
    function run() {
      clear();
      running = true;
      for (const [ms, fn] of stepsRef.current) timers.push(window.setTimeout(fn, ms));
      timers.push(
        window.setTimeout(() => {
          if (visible && !document.hidden) run();
          else running = false;
        }, period),
      );
    }
    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[entries.length - 1]?.isIntersecting ?? false;
        if (visible && !running && !document.hidden) run();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    const onVisibility = () => {
      if (!document.hidden && visible && !running) run();
    };
    document.addEventListener("visibilitychange", onVisibility);
    replayRef.current = run;
    return () => {
      clear();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      replayRef.current = null;
    };
  }, [host, period, enabled]);

  return useCallback(() => replayRef.current?.(), []);
}
