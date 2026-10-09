"use client";

import { useEffect, useRef } from "react";
import { DUR, E, G, HOLD, S, logoPaths, prefersReducedMotion } from "./logo-morph";

/* The live logo, behaviour unchanged from docs/assets/logo/logo.js:
   - plays once on load (41 → AI → 41), then follows hover and focus;
   - 500 ms per direction, cubic in-out, 900 ms hold on load;
   - past the halfway point it gets .is-on: the plate inverts to an outline and
     the wordmark tracking opens (maintenance.css);
   - does nothing when the user prefers reduced motion.
   The server-rendered markup equals the mockup's. */

const REST = logoPaths(0);

export function Logo() {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const logo = ref.current;
    if (!logo || prefersReducedMotion()) return;
    const l = logo.querySelector<SVGPathElement>("[data-logo-left]");
    const r = logo.querySelector<SVGPathElement>("[data-logo-right]");
    if (!l || !r) return;
    const el = logo;
    const left = l;
    const right = r;

    let cur = 0;
    let target = 0;
    let raf = 0;
    let last = 0;
    let hold = 0;

    function draw(v: number) {
      const e = E(Math.max(0, Math.min(1, v)));
      left.setAttribute("d", S(G.four, G.A, e));
      right.setAttribute("d", S(G.one, G.I, e));
      el.classList.toggle("is-on", v > 0.5);
    }
    function step(now: number) {
      if (!last) last = now;
      const dt = Math.min(64, now - last);
      last = now;
      const dir = target > cur ? 1 : -1;
      cur += dir * (dt / DUR);
      if ((dir > 0 && cur >= target) || (dir < 0 && cur <= target)) {
        cur = target;
        raf = 0;
        last = 0;
        draw(cur);
        return;
      }
      draw(cur);
      raf = requestAnimationFrame(step);
    }
    function go(v: number) {
      target = v;
      if (!raf) raf = requestAnimationFrame(step);
    }
    const on = () => go(1);
    const off = () => go(0);

    let started = false;
    function start() {
      started = true;
      el.addEventListener("mouseenter", on);
      el.addEventListener("mouseleave", off);
      el.addEventListener("focus", on);
      el.addEventListener("blur", off);
      el.setAttribute("data-logo-ready", "");
      go(1);
      hold = window.setTimeout(() => {
        if (target === 1) go(0);
      }, DUR + HOLD);
    }
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });

    return () => {
      window.removeEventListener("load", start);
      if (started) {
        el.removeEventListener("mouseenter", on);
        el.removeEventListener("mouseleave", off);
        el.removeEventListener("focus", on);
        el.removeEventListener("blur", off);
      }
      cancelAnimationFrame(raf);
      clearTimeout(hold);
    };
  }, []);

  return (
    <a className="logo" data-logo="" href="/" aria-label="41Prompts, home" ref={ref}>
      <svg className="logo-glyphs" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><rect className="logo-plate" x="2.5" y="2.5" width="59" height="59" rx="5"></rect><path className="logo-glyph" data-logo-left="" d={REST.left} fillRule="evenodd"></path><path className="logo-glyph" data-logo-right="" d={REST.right} fillRule="evenodd"></path></svg>
      <span className="logo-word">prompts</span>
    </a>
  );
}
