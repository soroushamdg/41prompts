"use client";

import { BlokCard, BlokKindGlyph, Button, Tag, type BlokKindName } from "@41prompts/ui";
import { useEffect, useRef, useState } from "react";
import { groupBloksByKind, type BlokView } from "@/lib/decompile/view-model";

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

/** The kind, as a reader would say it. `image_ref` is nobody's idea of a word. */
const KIND_NAME: Record<BlokKindName, string> = {
  context: "context",
  constraint: "constraint",
  example: "example",
  expected: "expected",
  image_ref: "image reference",
  image_input: "image input"
};

type View = "grouped" | "source";

function Card({
  blok,
  activeBlokId,
  pinnedBlokId,
  onHover,
  onPin,
  onUnpin
}: { blok: BlokView } & Omit<BlokListProps, "bloks">) {
  return (
    <BlokCard
      data-blok={blok.id}
      data-kind={blok.kind}
      // Shape on the leading edge, word in the tag. Two signals, neither of them a hue, and the word
      // is what a screen reader gets — the glyph is `aria-hidden`.
      leading={<BlokKindGlyph kind={blok.kind} />}
      kindTag={<Tag>{KIND_NAME[blok.kind]}</Tag>}
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
  );
}

export function BlokList({ bloks, activeBlokId, pinnedBlokId, onHover, onPin, onUnpin }: BlokListProps) {
  const list = useRef<HTMLDivElement>(null);

  /**
   * Grouped by default, and **remembered nowhere**. No `localStorage`, no cookie, no URL parameter:
   * epic decision 9 says this route persists nothing, and a view preference is still something about
   * a person kept between visits. Somebody who wants source order can press the button again; that
   * is a cheaper cost than the first stored thing on a page whose promise is "nothing is stored".
   */
  const [view, setView] = useState<View>("grouped");

  // Pinning from the source side has to bring the card into view, or the link is one-directional in
  // practice however bidirectional it is in principle.
  useEffect(() => {
    if (pinnedBlokId === null || !list.current) return;
    const card = list.current.querySelector<HTMLElement>(`[data-blok="${CSS.escape(pinnedBlokId)}"]`);
    card?.scrollIntoView({ block: "nearest" });
  }, [pinnedBlokId, view]);

  const cardProps = { activeBlokId, pinnedBlokId, onHover, onPin, onUnpin };

  return (
    <>
      {/*
        Two real buttons in a named group rather than a bespoke widget. `aria-pressed` says which
        view is showing, both are keyboard-native, and neither invents an interaction a reader has to
        learn. A tabs pattern was the alternative and was rejected: there is one list, re-ordered,
        not two panels.
      */}
      <div className="blok-view-control" role="group" aria-label="Blok order">
        <span className="blok-view-control-legend" aria-hidden="true">
          Order
        </span>
        <Button
          size="sm"
          aria-pressed={view === "grouped"}
          onClick={() => setView("grouped")}
          data-testid="view-grouped"
        >
          By kind
        </Button>
        <Button
          size="sm"
          aria-pressed={view === "source"}
          onClick={() => setView("source")}
          data-testid="view-source"
        >
          Source order
        </Button>
      </div>

      <div className="blok-list" ref={list} data-view={view}>
        {view === "source"
          ? bloks.map((blok) => <Card key={blok.id} blok={blok} {...cardProps} />)
          : groupBloksByKind(bloks).map((group) => (
              <section key={group.kind} className="blok-group" aria-labelledby={`group-${group.kind}`}>
                <h3 id={`group-${group.kind}`} className="blok-group-heading">
                  <BlokKindGlyph kind={group.kind} />
                  {KIND_NAME[group.kind]}{" "}
                  {/* An explicit space: the flex gap and the accessible name both read correctly
                      without it, but raw `textContent` comes out as "context3 bloks" — which is what
                      anything scraping the DOM, including our own staging check, actually sees. */}
                  <span className="blok-group-count">
                    {group.bloks.length === 1 ? "1 blok" : `${group.bloks.length} bloks`}
                  </span>
                </h3>
                {group.bloks.map((blok) => (
                  <Card key={blok.id} blok={blok} {...cardProps} />
                ))}
              </section>
            ))}
      </div>
    </>
  );
}
