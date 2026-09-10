"use client";

import { useCallback, useMemo, useRef, type KeyboardEvent } from "react";
import type { Piece } from "@/lib/decompile/view-model";

/**
 * The source prompt with every blok's ranges marked, and the interaction that links them to the
 * cards beside them.
 *
 * The decompiler prototype is the interaction spec (epic notes), and two things in it are
 * deliberately not carried over:
 *
 * - **The fragment badge is a DOM child there** — `<span class="frag">1/3</span>` *inside* the
 *   highlighted span — which puts `"1/3"` into the span's `textContent` and breaks the criterion
 *   that the highlighted characters are exactly the range. Here it is a CSS `::after` fed from
 *   `data-fragment`, so the span's text is the range and nothing else. Its accessible name comes
 *   from `aria-describedby`, which adds to a description rather than replacing the content.
 * - **Every span is a tab stop there.** `docs/design/README.md` corrects that: one tab stop per
 *   blok, arrow keys within. A forty-span prompt is otherwise forty tab stops before the reader
 *   reaches anything else on the page.
 */

export interface SourceMapProps {
  readonly pieces: readonly Piece[];
  readonly activeBlokId: string | null;
  readonly pinnedBlokId: string | null;
  readonly onHover: (blokId: string | null) => void;
  readonly onPin: (blokId: string) => void;
  readonly onUnpin: () => void;
}

export function SourceMap({ pieces, activeBlokId, pinnedBlokId, onHover, onPin, onUnpin }: SourceMapProps) {
  const container = useRef<HTMLDivElement>(null);

  /** Every distinct "fragment i of n" this prompt needs, rendered once and pointed at by id. */
  const fragmentDescriptions = useMemo(() => {
    const seen = new Set<string>();
    for (const piece of pieces) {
      if (piece.kind === "span" && piece.fragmentCount > 1) seen.add(`${piece.fragmentIndex}-${piece.fragmentCount}`);
    }
    return [...seen].sort();
  }, [pieces]);

  /**
   * Arrow keys move within the focused blok's own fragments — "arrow keys within", the useful
   * reading: a rule stated in three places is one tab stop and two arrow presses to walk it.
   */
  const moveWithinBlok = useCallback((blokId: string, from: number, delta: number) => {
    const root = container.current;
    if (!root) return;
    const siblings = [...root.querySelectorAll<HTMLElement>(`[data-blok="${CSS.escape(blokId)}"]`)];
    if (siblings.length < 2) return;
    const next = siblings[(from - 1 + delta + siblings.length) % siblings.length];
    next?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLSpanElement>, piece: Extract<Piece, { kind: "span" }>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (pinnedBlokId === piece.blokId) onUnpin();
        else onPin(piece.blokId);
        return;
      }
      if (event.key === "Escape") {
        if (pinnedBlokId !== null) {
          event.preventDefault();
          onUnpin();
        }
        return;
      }
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        moveWithinBlok(piece.blokId, piece.fragmentIndex, 1);
        return;
      }
      if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        moveWithinBlok(piece.blokId, piece.fragmentIndex, -1);
      }
    },
    [moveWithinBlok, onPin, onUnpin, pinnedBlokId]
  );

  return (
    <div className="source-map" ref={container} data-testid="source-map">
      {pieces.map((piece, index) => {
        if (piece.kind === "gap") return <span key={index}>{piece.text}</span>;
        const highlighted = activeBlokId === piece.blokId;
        const pinned = pinnedBlokId === piece.blokId;
        const multi = piece.fragmentCount > 1;
        return (
          <span
            key={index}
            className="source-span"
            data-blok={piece.blokId}
            data-highlighted={highlighted ? "true" : undefined}
            data-pinned={pinned ? "true" : undefined}
            {...(multi ? { "data-fragment": `${piece.fragmentIndex}/${piece.fragmentCount}` } : {})}
            // One tab stop per blok: the blok's first fragment is tabbable, the rest are reachable
            // from it with the arrow keys.
            tabIndex={piece.fragmentIndex === 1 ? 0 : -1}
            role="button"
            aria-pressed={pinned}
            {...(multi ? { "aria-describedby": `fragment-${piece.fragmentIndex}-${piece.fragmentCount}` } : {})}
            onMouseEnter={() => onHover(piece.blokId)}
            onMouseLeave={() => onHover(null)}
            onFocus={() => onHover(piece.blokId)}
            onBlur={() => onHover(null)}
            onClick={() => (pinned ? onUnpin() : onPin(piece.blokId))}
            onKeyDown={(event) => onKeyDown(event, piece)}
          >
            {piece.text}
          </span>
        );
      })}
      <span hidden>
        {fragmentDescriptions.map((key) => {
          const [index, count] = key.split("-");
          return (
            <span key={key} id={`fragment-${key}`}>{`fragment ${index} of ${count}`}</span>
          );
        })}
      </span>
    </div>
  );
}
