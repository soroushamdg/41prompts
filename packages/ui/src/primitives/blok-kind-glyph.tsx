import type { ReactNode } from "react";
import { cx } from "../cx";

/**
 * A per-kind marker that distinguishes by **shape, in ink** — never by hue.
 *
 * Two rules meet here. Green, red and amber mean pass, fail and drift and nothing else, and blok
 * category colour is unshipped: `docs/design/README.md` records EPIC-003's deviation as accepted,
 * with EPIC-020 owning a real per-kind mapping or confirming ink-only is permanent. So a card cannot
 * be told apart by tint, and the glyph has to carry the difference on its own.
 *
 * Straight segments only, `currentColor`, no soft curves — the illustration system's rules, so these
 * sit beside the eight SVGs without looking borrowed from somewhere else. Each glyph is a picture of
 * what the kind *is*: a plate of prose, a limit, an input/output pair, an equality, a picture frame,
 * a frame something is fed into.
 *
 * **The glyph is never the only signal.** Every card also carries the kind's name as text, because a
 * shape nobody has been taught is not an affordance, and a screen reader gets the word rather than a
 * decorative image (`aria-hidden`).
 */

export type BlokKindName = "context" | "constraint" | "example" | "expected" | "image_ref" | "image_input";

export interface BlokKindGlyphProps {
  kind: BlokKindName;
  className?: string;
}

/** 16×16, 2px strokes, drawn on a grid so the six read as one set at 12px. */
const PATHS: Record<BlokKindName, ReactNode> = {
  // A plate of prose: the surrounding frame, with two text rules inside.
  context: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <line x1="5" y1="7" x2="11" y2="7" />
      <line x1="5" y1="10" x2="9" y2="10" />
    </>
  ),
  // A limit: a bar with a hard stop at each end.
  constraint: (
    <>
      <line x1="3" y1="4" x2="3" y2="12" />
      <line x1="13" y1="4" x2="13" y2="12" />
      <line x1="3" y1="8" x2="13" y2="8" />
    </>
  ),
  // An input/output pair: two runs of different length, one above the other.
  example: (
    <>
      <line x1="2" y1="5" x2="10" y2="5" />
      <line x1="2" y1="11" x2="14" y2="11" />
      <line x1="12" y1="3" x2="12" y2="7" />
    </>
  ),
  // An equality: what the output must come out as.
  expected: (
    <>
      <line x1="3" y1="6" x2="13" y2="6" />
      <line x1="3" y1="10" x2="13" y2="10" />
    </>
  ),
  // A picture already in the prompt: a frame with a diagonal across it.
  image_ref: (
    <>
      <rect x="2" y="3" width="12" height="10" />
      <line x1="2" y1="13" x2="14" y2="3" />
    </>
  ),
  // A picture fed in at run time: the same frame, with an arrow entering it.
  image_input: (
    <>
      <rect x="6" y="3" width="8" height="10" />
      <line x1="1" y1="8" x2="6" y2="8" />
      <line x1="3" y1="5" x2="6" y2="8" />
      <line x1="3" y1="11" x2="6" y2="8" />
    </>
  )
};

export function BlokKindGlyph({ kind, className }: BlokKindGlyphProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cx("blok-kind-glyph", className)}
      // Decorative: the kind's name is beside it as text, so announcing the shape as well would read
      // the same fact twice.
      aria-hidden="true"
      focusable="false"
      data-kind={kind}
    >
      {PATHS[kind]}
    </svg>
  );
}
