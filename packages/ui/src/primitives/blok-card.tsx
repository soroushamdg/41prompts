import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
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
  /**
   * `"button"` (the default) for a card that *is* a control, `"div"` for one that *contains* them.
   *
   * A `<button>` with a textarea inside it is `nested-interactive`; see the note on the component.
   */
  as?: "button" | "div";
}

/**
 * A real `<button>` by default — a blok in the decompiler is selectable, so it is a button and not a
 * `div` with an onClick.
 *
 * **`as="div"` exists for the canvas, where the card is not itself a control.** There the card
 * *contains* controls — a textarea, move buttons, delete — and a button containing focusable
 * children is `nested-interactive`, which axe flags and screen readers genuinely mishandle: the
 * textarea inside a button may not be announced at all. Caught by the canvas's own axe test rather
 * than reasoned about, and fixed by making the container stop claiming to be a control.
 */
export function BlokCard({
  kindTag,
  children,
  meta,
  selected,
  leading,
  kind,
  as = "button",
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

  const shared = {
    className: cx("blok-card", leading && "blok-card-railed", className),
    "data-selected": selected ? "true" : undefined,
    "data-kind": kind,
  };

  if (as === "div") {
    // `rest` is typed for a button; the overlap that matters here (aria-*, data-*, id, onKeyDown)
    // is identical on a div, and `type` is dropped rather than written onto an element that has no
    // such attribute.
    const divProps = rest as unknown as HTMLAttributes<HTMLDivElement>;
    return (
      <div {...shared} {...divProps}>
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
      </div>
    );
  }

  return (
    <button type={type} {...shared} {...rest}>
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
