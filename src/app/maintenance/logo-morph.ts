/* The 41 ↔ AI morph from docs/assets/logo/logo.js, ported to TypeScript with
   the same numbers: G (shapes), L (lerp), P (path), S (shape pair), E (cubic
   in-out). Each pair has the same vertex count, so the morph is a straight
   vertex-by-vertex interpolation. Shape data: docs/assets/logo/logo-morph.json. */

export type Pt = readonly [number, number];
export type Shape = { outer: readonly Pt[]; inner: readonly Pt[] | null };

export const G = {
  four: { outer: [[18, 14], [32, 14], [32, 50], [25, 50], [25, 41], [8, 41], [8, 41], [8, 41], [8, 34]], inner: [[25, 17], [25, 34], [15, 34]] },
  A: { outer: [[28, 14], [34, 14], [44, 50], [36, 50], [31, 41], [21, 41], [16, 50], [8, 50], [16, 36]], inner: [[30, 20], [31, 34], [24, 34]] },
  one: { outer: [[38, 21], [44, 14], [48, 14], [48, 50], [41, 50], [41, 21]], inner: null },
  I: { outer: [[45, 14], [45, 14], [51, 14], [45, 50], [38, 50], [41.5, 32]], inner: null },
} as const satisfies Record<string, Shape>;

/** Milliseconds per direction, and the hold before the load play returns to 41. */
export const DUR = 500;
export const HOLD = 900;

export function L(a: readonly Pt[], b: readonly Pt[], t: number): Pt[] {
  return a.map((p, i) => {
    const q = b[i] ?? p;
    return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t] as const;
  });
}

export function P(p: readonly Pt[]): string {
  return p.map((pt, i) => (i ? "L" : "M") + pt[0].toFixed(2) + " " + pt[1].toFixed(2)).join("") + "Z";
}

export function S(f: Shape, t: Shape, v: number): string {
  let d = P(L(f.outer, t.outer, v));
  if (f.inner && t.inner) d += " " + P(L(f.inner, t.inner, v));
  return d;
}

export function E(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** logoPaths(0) is "41", logoPaths(1) is "AI". */
export function logoPaths(v: number): { left: string; right: string } {
  const e = E(Math.max(0, Math.min(1, v)));
  return { left: S(G.four, G.A, e), right: S(G.one, G.I, e) };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
