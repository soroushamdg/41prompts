"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "./logo-morph";

/* BP.crosshair from docs/assets/js/motion.js: dashed guides follow the mouse
   over the parent element (lerp 0.28) with an "X 0412  Y 0188" readout.
   Fine pointers only, and off under reduced motion. */
export function Crosshair() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = ref.current;
    const section = box?.parentElement;
    const read = box?.querySelector<HTMLElement>(".xhair__read");
    if (!box || !section || !read) return;
    if (prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const el = box;
    const host = section;
    const readout = read;

    let tx = 0;
    let ty = 0;
    let x = 0;
    let y = 0;
    let raf = 0;
    let on = false;

    function tick() {
      x += (tx - x) * 0.28;
      y += (ty - y) * 0.28;
      el.style.setProperty("--x", x.toFixed(1) + "px");
      el.style.setProperty("--y", y.toFixed(1) + "px");
      readout.textContent = "X " + String(Math.round(tx)).padStart(4, "0") + "  Y " + String(Math.round(ty)).padStart(4, "0");
      if (Math.abs(tx - x) > 0.3 || Math.abs(ty - y) > 0.3) raf = requestAnimationFrame(tick);
      else raf = 0;
    }
    function move(e: PointerEvent) {
      if (e.pointerType !== "mouse") return;
      const r = host.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!on) {
        x = tx;
        y = ty;
        on = true;
        el.classList.add("is-on");
      }
      el.classList.toggle("is-dim", e.target instanceof Element && !!e.target.closest("a, button"));
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function leave() {
      on = false;
      el.classList.remove("is-on");
    }

    host.addEventListener("pointermove", move);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="xhair" aria-hidden="true" ref={ref}>
      <span className="xhair__h" />
      <span className="xhair__v" />
      <span className="xhair__read" />
    </div>
  );
}
