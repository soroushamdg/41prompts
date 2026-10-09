import { prefersReducedMotion } from "./reduced-motion";

/* BP.prepPath and BP.drawPath from docs/assets/js/motion.js. Line drawing is
   SVG stroke-dashoffset with the drawing ease (DESIGN.md §8). */

export const EASE_DRAW = "cubic-bezier(.6,0,.2,1)";

/** Hides a stroke behind its own dash so it can be drawn. Under reduced
    motion it stays fully drawn. Returns the stroke length. */
export function prepPath(path: SVGGeometryElement, reduce = prefersReducedMotion()): number {
  const len = path.getTotalLength ? path.getTotalLength() : 0;
  path.style.transition = "none";
  path.style.strokeDasharray = `${len} ${len}`;
  path.style.strokeDashoffset = reduce ? "0" : String(len);
  return len;
}

/** Draws a stroke from nothing to its full length. */
export function drawPath(path: SVGGeometryElement, ms = 900, delay = 0): number {
  const reduce = prefersReducedMotion();
  const len = prepPath(path, reduce);
  if (reduce) return len;
  path.getBoundingClientRect(); // commit the hidden state before transitioning
  path.style.transition = `stroke-dashoffset ${ms}ms ${EASE_DRAW} ${delay}ms`;
  path.style.strokeDashoffset = "0";
  return len;
}

/** Shows a stroke fully drawn, with no transition. */
export function showPath(path: SVGGeometryElement) {
  prepPath(path, true);
}
