/* The 41prompts logo: "41" morphs into "AI". The shapes, interpolation,
   path builder and easing are copied unchanged from docs/assets/logo/logo.js
   (the live 41prompts.ai logo); src/lib/logo.test.ts pins them to the
   mockup's SVG markup and to docs/assets/logo/logo-morph.json. */

type Pt = [number, number];
type Shape = { outer: Pt[]; inner: Pt[] | null };

export const logoShapes: Record<"four" | "A" | "one" | "I", Shape> = {
  four: { outer: [[18,14],[32,14],[32,50],[25,50],[25,41],[8,41],[8,41],[8,41],[8,34]], inner: [[25,17],[25,34],[15,34]] },
  A:    { outer: [[28,14],[34,14],[44,50],[36,50],[31,41],[21,41],[16,50],[8,50],[16,36]], inner: [[30,20],[31,34],[24,34]] },
  one:  { outer: [[38,21],[44,14],[48,14],[48,50],[41,50],[41,21]], inner: null },
  I:    { outer: [[45,14],[45,14],[51,14],[45,50],[38,50],[41.5,32]], inner: null },
};

const G = logoShapes;
function L(a: Pt[], b: Pt[], t: number): Pt[] { const o: Pt[] = []; for (let i = 0; i < a.length; i++) o.push([a[i]![0] + (b[i]![0] - a[i]![0]) * t, a[i]![1] + (b[i]![1] - a[i]![1]) * t]); return o; }
function P(p: Pt[]): string { let d = "M" + p[0]![0].toFixed(2) + " " + p[0]![1].toFixed(2); for (let i = 1; i < p.length; i++) d += "L" + p[i]![0].toFixed(2) + " " + p[i]![1].toFixed(2); return d + "Z"; }
function S(f: Shape, t: Shape, v: number): string { let d = P(L(f.outer, t.outer, v)); if (f.inner && t.inner) d += " " + P(L(f.inner, t.inner, v)); return d; }
export function logoEase(t: number): number { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

/** logoPaths(0) is "41", logoPaths(1) is "AI". */
export function logoPaths(v: number): { left: string; right: string } {
  const e = logoEase(Math.max(0, Math.min(1, v)));
  return { left: S(G.four, G.A, e), right: S(G.one, G.I, e) };
}

export const LOGO_DURATION_MS = 500;
export const LOGO_HOLD_MS = 900;

/** Static "41" paths for server-rendered markup. */
export const LOGO_REST = logoPaths(0);

/**
 * Attaches the live morph to one logo element, exactly as logo.js does:
 * plays once on load (41 → AI → 41 with a 900 ms hold), then follows hover
 * and focus; past the halfway point the logo gets .is-on. Does nothing when
 * the user prefers reduced motion. Returns a cleanup function.
 */
export function attachLogoMorph(logo: HTMLElement): () => void {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return () => {};
  const l = logo.querySelector<SVGPathElement>("[data-logo-left]");
  const r = logo.querySelector<SVGPathElement>("[data-logo-right]");
  if (!l || !r) return () => {};
  const DUR = LOGO_DURATION_MS, HOLD = LOGO_HOLD_MS;
  let cur = 0, target = 0, raf = 0, last = 0, holdTimer = 0, started = false;
  function draw(v: number) { const e = logoEase(Math.max(0, Math.min(1, v))); l!.setAttribute("d", S(G.four, G.A, e)); r!.setAttribute("d", S(G.one, G.I, e)); logo.classList.toggle("is-on", v > 0.5); }
  function step(now: number) {
    if (!last) last = now;
    const dt = Math.min(64, now - last); last = now;
    const dir = target > cur ? 1 : -1; cur += dir * (dt / DUR);
    if ((dir > 0 && cur >= target) || (dir < 0 && cur <= target)) { cur = target; raf = 0; last = 0; draw(cur); return; }
    draw(cur); raf = requestAnimationFrame(step);
  }
  function go(v: number) { target = v; if (!raf) raf = requestAnimationFrame(step); }
  const enter = () => go(1);
  const leave = () => go(0);
  function start() {
    if (started) return;
    started = true;
    logo.addEventListener("mouseenter", enter);
    logo.addEventListener("mouseleave", leave);
    logo.addEventListener("focus", enter);
    logo.addEventListener("blur", leave);
    logo.setAttribute("data-logo-ready", "");
    go(1); holdTimer = window.setTimeout(() => { if (target === 1) go(0); }, DUR + HOLD);
  }
  if (document.readyState === "complete") start(); else window.addEventListener("load", start, { once: true });
  return () => {
    window.removeEventListener("load", start);
    logo.removeEventListener("mouseenter", enter);
    logo.removeEventListener("mouseleave", leave);
    logo.removeEventListener("focus", enter);
    logo.removeEventListener("blur", leave);
    clearTimeout(holdTimer);
    if (raf) cancelAnimationFrame(raf);
  };
}
