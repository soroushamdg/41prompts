import type { CSSProperties } from "react";
import { cx } from "../cx";

/**
 * The 41Prompts mark: a filled plate carrying `41`, which morphs into an italic `AI`.
 *
 * The outlines, their vertex order and the interpolation are copied verbatim from
 * `docs/design/41prompts-logo-v2.html` — **the prototype's shapes, not its event model**. It morphs
 * on hover and focus; EPIC-016 decision 8 asks for once on load and not on a loop, so that is what
 * `logoMorphScript` does (hover and focus still work, because a mark that responds to a pointer is
 * the prototype's own interaction and nothing in the epic argues with it).
 *
 * **Why point arrays and not two SVGs with a crossfade.** Both glyphs are one closed contour plus one
 * counter with matched vertex counts, so every point maps to a point and the corners stay mitred all
 * the way through. A crossfade ghosts; stacked rotating rectangles break at the joints, which is what
 * v1 did.
 *
 * **It renders the static `41` on the server.** With JavaScript off that is what stays — the
 * prototype's own stated degradation — and it is also the resting state, so nothing is missing.
 */

type Point = readonly [number, number];
interface Glyph {
  readonly outer: readonly Point[];
  readonly inner: readonly Point[] | null;
}

/**
 * Matched vertex counts, and the stacked points matter.
 *
 * Three of the `4`'s nine outer vertices sit on top of each other at the bottom-left of the crossbar
 * doing nothing; in the `A` they separate into the left leg, so the leg grows out of the crossbar
 * instead of fading in. The diagonal is never reset — it stays the same edge, only steeper.
 */
export const LOGO_GLYPHS: Readonly<Record<"four" | "A" | "one" | "I", Glyph>> = {
  four: {
    outer: [[18, 14], [32, 14], [32, 50], [25, 50], [25, 41], [8, 41], [8, 41], [8, 41], [8, 34]],
    inner: [[25, 17], [25, 34], [15, 34]]
  },
  A: {
    outer: [[28, 14], [34, 14], [44, 50], [36, 50], [31, 41], [21, 41], [16, 50], [8, 50], [16, 36]],
    inner: [[30, 20], [31, 34], [24, 34]]
  },
  one: {
    outer: [[38, 21], [44, 14], [48, 14], [48, 50], [41, 50], [41, 21]],
    inner: null
  },
  I: {
    outer: [[45, 14], [45, 14], [51, 14], [45, 50], [38, 50], [41.5, 32]],
    inner: null
  }
};

function lerpPoints(a: readonly Point[], b: readonly Point[], t: number): Point[] {
  return a.map((point, i) => {
    const other = b[i] ?? point;
    return [point[0] + (other[0] - point[0]) * t, point[1] + (other[1] - point[1]) * t] as const;
  });
}

function toPath(points: readonly Point[]): string {
  const head = points[0];
  if (head === undefined) return "";
  let d = `M${head[0].toFixed(2)} ${head[1].toFixed(2)}`;
  for (let i = 1; i < points.length; i++) {
    const point = points[i];
    if (point !== undefined) d += `L${point[0].toFixed(2)} ${point[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

function glyphPath(from: Glyph, to: Glyph, t: number): string {
  let d = toPath(lerpPoints(from.outer, to.outer, t));
  if (from.inner !== null && to.inner !== null) d += ` ${toPath(lerpPoints(from.inner, to.inner, t))}`;
  return d;
}

/** The two glyph paths at a point in the morph. `0` is `41`, `1` is `AI`. */
export function logoPathsAt(t: number): { readonly left: string; readonly right: string } {
  return {
    left: glyphPath(LOGO_GLYPHS.four, LOGO_GLYPHS.A, t),
    right: glyphPath(LOGO_GLYPHS.one, LOGO_GLYPHS.I, t)
  };
}

export interface LogoMarkProps {
  /** Rendered as a link when set; otherwise a plain mark (the footer already links the wordmark). */
  href?: string;
  /** Font size of the wordmark; the plate scales from it. Pass a CSS length. */
  size?: string;
  className?: string;
}

export function LogoMark({ href, size, className }: LogoMarkProps) {
  const paths = logoPathsAt(0);
  const style = size === undefined ? undefined : ({ ["--logo-size"]: size } as CSSProperties);
  const inner = (
    <>
      <svg className="logo-glyphs" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
        <rect className="logo-plate" x="2.5" y="2.5" width="59" height="59" rx="5" />
        {/* `suppressHydrationWarning` because the morph script mutates `d` before React hydrates —
            a deliberate mismatch on exactly this attribute, not a bug. Without it React logs a
            hydration error on every load and the page's own console is no longer trustworthy. */}
        <path className="logo-glyph" data-logo-left="" d={paths.left} fillRule="evenodd" suppressHydrationWarning />
        <path className="logo-glyph" data-logo-right="" d={paths.right} fillRule="evenodd" suppressHydrationWarning />
      </svg>
      <span className="logo-word">prompts</span>
    </>
  );

  // The accessible name is "41Prompts" in both states (the prototype's own rule): the mark is
  // `aria-hidden`, the word is visible text, and the link carries the whole name so a screen reader
  // never announces a bare "prompts".
  // `suppressHydrationWarning` here as well as on the paths: the morph script also stamps
  // `data-logo-ready` on this element before React hydrates. EPIC-016 suppressed the `d` mismatch and
  // missed this one, which left a hydration error in the dev console on every page load.
  return href === undefined ? (
    <span className={cx("logo", className)} style={style} data-logo="" suppressHydrationWarning>
      {inner}
    </span>
  ) : (
    <a
      className={cx("logo", className)}
      style={style}
      href={href}
      aria-label="41Prompts, home"
      data-logo=""
      suppressHydrationWarning
    >
      {inner}
    </a>
  );
}

/**
 * The morph, as an inline script rather than a hydrated component.
 *
 * EPIC-016 decision 10: no client-side framework work on the critical path. This is the whole
 * animation in a few hundred bytes with no React, no hydration and no module graph — the same shape
 * as the theme script this app already inlines.
 *
 * **It plays out and back, once.** The morph's far end is `AI`, and a mark that settles there reads
 * "AIprompts", which is not the name of the product; so "runs once on load" is a round trip, and the
 * state it ends in is the `41` the server rendered.
 *
 * **`prefers-reduced-motion` returns immediately**, leaving that same `41` — the animation's end
 * state, not a skipped frame.
 */
export function logoMorphScript(): string {
  const glyphs = JSON.stringify(LOGO_GLYPHS);
  return `(function(){var G=${glyphs};
function L(a,b,t){var o=[],i;for(i=0;i<a.length;i++)o.push([a[i][0]+(b[i][0]-a[i][0])*t,a[i][1]+(b[i][1]-a[i][1])*t]);return o}
function P(p){var d="M"+p[0][0].toFixed(2)+" "+p[0][1].toFixed(2),i;for(i=1;i<p.length;i++)d+="L"+p[i][0].toFixed(2)+" "+p[i][1].toFixed(2);return d+"Z"}
function S(f,t,v){var d=P(L(f.outer,t.outer,v));if(f.inner&&t.inner)d+=" "+P(L(f.inner,t.inner,v));return d}
function E(t){return t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
if(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;
var DUR=500,HOLD=900;
function start(){document.querySelectorAll("[data-logo]").forEach(function(logo){
var l=logo.querySelector("[data-logo-left]"),r=logo.querySelector("[data-logo-right]");
if(!l||!r)return;
var cur=0,target=0,raf=0,last=0;
function draw(v){var e=E(Math.max(0,Math.min(1,v)));l.setAttribute("d",S(G.four,G.A,e));r.setAttribute("d",S(G.one,G.I,e));logo.classList.toggle("is-on",v>0.5)}
function step(now){if(!last)last=now;var dt=Math.min(64,now-last);last=now;var dir=target>cur?1:-1;cur+=dir*(dt/DUR);
if((dir>0&&cur>=target)||(dir<0&&cur<=target)){cur=target;raf=0;last=0;draw(cur);return}draw(cur);raf=requestAnimationFrame(step)}
function go(v){target=v;if(!raf)raf=requestAnimationFrame(step)}
logo.addEventListener("mouseenter",function(){go(1)});
logo.addEventListener("mouseleave",function(){go(0)});
logo.addEventListener("focus",function(){go(1)});
logo.addEventListener("blur",function(){go(0)});
logo.setAttribute("data-logo-ready","");
go(1);setTimeout(function(){if(target===1)go(0)},DUR+HOLD)})}
if(document.readyState==="complete")start();else window.addEventListener("load",start)})();`;
}
