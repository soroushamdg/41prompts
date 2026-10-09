"use client";
import { useEffect, type RefObject } from "react";
import { prefersReducedMotion } from "./reduced-motion";

/* BP.crosshair from docs/assets/js/motion.js: dashed guides follow the mouse
   over the box's parent (lerp 0.28) with an "X 0412  Y 0188" readout. Fine
   pointers only, never under reduced motion. The guides dim over anything
   matching `dim`. */
export function useCrosshair(boxRef: RefObject<HTMLElement | null>, dim = "a, button, input, textarea") {
  useEffect(() => {
    const box = boxRef.current;
    const host = box?.parentElement;
    const read = box?.querySelector<HTMLElement>(".xhair__read");
    if (!box || !host || !read) return;
    if (prefersReducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
    const el = box;
    const section = host;
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
      const r = section.getBoundingClientRect();
      tx = e.clientX - r.left;
      ty = e.clientY - r.top;
      if (!on) {
        x = tx;
        y = ty;
        on = true;
        el.classList.add("is-on");
      }
      el.classList.toggle("is-dim", e.target instanceof Element && !!e.target.closest(dim));
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function leave() {
      on = false;
      el.classList.remove("is-on");
    }
    section.addEventListener("pointermove", move);
    section.addEventListener("pointerleave", leave);
    return () => {
      section.removeEventListener("pointermove", move);
      section.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(raf);
    };
  }, [boxRef, dim]);
}
