"use client";

import { BlokCard, Tag } from "@41prompts/ui";
import { useEffect, useRef } from "react";
import type { BlokView } from "@/lib/decompile/view-model";

export interface BlokListProps {
  readonly bloks: readonly BlokView[];
  readonly activeBlokId: string | null;
  readonly pinnedBlokId: string | null;
  readonly onHover: (blokId: string | null) => void;
  readonly onPin: (blokId: string) => void;
  readonly onUnpin: () => void;
}

/**
 * How a blok's summary is described, in plain words.
 *
 * Epic decision 6, which is also EPIC-080's orphaned question answered: show `Summary.source` and
 * nothing more. No badge, no icon, no warning colour — if the funnel later says summaries are
 * over-trusted, that is a data change and not a redesign. "Rule" rather than "heuristic" because the
 * reader is not required to know our word for it.
 */
function summaryOrigin(source: BlokView["summarySource"]): string {
  return source === "model" ? "summarised by model" : "summarised by rule";
}

export function BlokList({ bloks, activeBlokId, pinnedBlokId, onHover, onPin, onUnpin }: BlokListProps) {
  const list = useRef<HTMLDivElement>(null);

  // Pinning from the source side has to bring the card into view, or the link is one-directional in
  // practice however bidirectional it is in principle.
  useEffect(() => {
    if (pinnedBlokId === null || !list.current) return;
    const card = list.current.querySelector<HTMLElement>(`[data-blok="${CSS.escape(pinnedBlokId)}"]`);
    card?.scrollIntoView({ block: "nearest" });
  }, [pinnedBlokId]);

  return (
    <div className="blok-list" ref={list}>
      {bloks.map((blok) => (
        <BlokCard
          key={blok.id}
          data-blok={blok.id}
          kindTag={<Tag>{blok.kind}</Tag>}
          selected={activeBlokId === blok.id || pinnedBlokId === blok.id}
          aria-pressed={pinnedBlokId === blok.id}
          onMouseEnter={() => onHover(blok.id)}
          onMouseLeave={() => onHover(null)}
          onFocus={() => onHover(blok.id)}
          onBlur={() => onHover(null)}
          onClick={() => (pinnedBlokId === blok.id ? onUnpin() : onPin(blok.id))}
          meta={
            <>
              <span>{summaryOrigin(blok.summarySource)}</span>
              <span>{blok.words === 1 ? "1 word" : `${blok.words} words`}</span>
              {blok.rangeCount > 1 && <span>{`${blok.rangeCount} places in the source`}</span>}
            </>
          }
        >
          {blok.summary}
        </BlokCard>
      ))}
    </div>
  );
}
