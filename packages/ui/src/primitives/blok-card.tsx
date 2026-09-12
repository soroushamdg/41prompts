import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../cx";

export interface BlokCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  kindTag: ReactNode;
  children: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  /**
   * A persistent marker on the card's leading edge.
   *
   * The decompiler prototype puts a coloured bar here, keyed on the blok's kind. That cannot ship:
   * blok category colour is unshipped (`docs/design/README.md`, EPIC-003's accepted deviation) and
   * green, red and amber are spoken for — so an ink bar sits directly against the card's ink border
   * and reads as a slightly thicker border rather than as a marker. Measured by looking at it.
   *
   * A **shape** in the rail carries what a hue cannot. Optional, and when it is absent the card's
   * markup is byte-identical to what it was before this prop existed, so `/dev/ui`'s committed
   * visual-regression baselines do not move.
   */
  leading?: ReactNode;
  /**
   * The blok's kind, surfaced as `data-kind` so CSS can reach the category colour.
   *
   * **The colour it unlocks appears only during interaction** — hover, `:focus-visible`, selection
   * — and never at rest (EPIC-021a decision 6, and `docs/design/README.md`). At rest a card is told
   * apart by its glyph and by the kind's name as text, which is what EPIC-013 shipped and what a
   * hue must not be allowed to replace: a shape nobody has been taught is not an affordance, and a
   * colour nobody can see is worse.
   *
   * Optional, and when it is absent the markup is byte-identical to what it was before, so
   * `/dev/ui`'s committed baselines do not move.
   */
  kind?: string;
}

/** A real `<button>` — every blok in the canvas is keyboard-reachable and -activatable, not a
 * `div` with an onClick. */
export function BlokCard({
  kindTag,
  children,
  meta,
  selected,
  leading,
  kind,
  className,
  type = "button",
  ...rest
}: BlokCardProps) {
  const inner = (
    <>
      <div className="blok-card-top">{kindTag}</div>
      <div className="blok-card-body">{children}</div>
      {meta && <div className="blok-card-meta">{meta}</div>}
    </>
  );

  return (
    <button
      type={type}
      className={cx("blok-card", leading && "blok-card-railed", className)}
      data-selected={selected ? "true" : undefined}
      data-kind={kind}
      {...rest}
    >
      {leading ? (
        <>
          <span className="blok-card-rail" aria-hidden="true">
            {leading}
          </span>
          <span className="blok-card-main">{inner}</span>
        </>
      ) : (
        inner
      )}
    </button>
  );
}
