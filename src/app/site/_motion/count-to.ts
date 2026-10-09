import { prefersReducedMotion } from "./reduced-motion";

/* BP.countTo from docs/assets/js/motion.js: a number counts up with a cubic
   ease-out. Under reduced motion it shows the final value at once. */

export type CountOptions = { decimals?: number; prefix?: string; suffix?: string; ms?: number };

export function formatCount(v: number, { decimals = 0, prefix = "", suffix = "" }: CountOptions = {}): string {
  return prefix + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
}

/** Counts el's text up to `to`. Returns a function that cancels the count. */
export function countTo(el: HTMLElement, to: number, opts: CountOptions = {}): () => void {
  // Write into the existing text node so React keeps owning it.
  const write = (text: string) => {
    const node = el.firstChild;
    if (node && node.nodeType === Node.TEXT_NODE && !node.nextSibling) node.nodeValue = text;
    else el.textContent = text;
  };
  if (prefersReducedMotion()) {
    write(formatCount(to, opts));
    return () => {};
  }
  const dur = opts.ms ?? 1100;
  let t0 = 0;
  let raf = 0;
  function step(now: number) {
    if (!t0) t0 = now;
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    write(formatCount(to * e, opts));
    if (p < 1) raf = requestAnimationFrame(step);
  }
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}
