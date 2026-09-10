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
}

/** A real `<button>` — every blok in the canvas is keyboard-reachable and -activatable, not a
 * `div` with an onClick. */
export function BlokCard({ kindTag, children, meta, selected, leading, className, type = "button", ...rest }: BlokCardProps) {
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
