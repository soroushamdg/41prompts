"use client";

import { Button, KpiStrip } from "@41prompts/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { BlokList } from "@/app/decompile/blok-list";
import { FindingsPanel } from "@/app/decompile/findings-panel";
import { SourceMap } from "@/app/decompile/source-map";
import { removeDecompile } from "@/app/decompile/share-actions";
import { RETENTION_SENTENCE } from "@/lib/decompile/share-state";
import type { DecompileView } from "@/lib/decompile/view-model";

/**
 * A shared decompile, read-only.
 *
 * Reuses `/decompile`'s own components rather than growing a second set: the whole promise of a
 * permalink is that a colleague sees what the sharer saw, and two renderers is how that stops being
 * true one small fix at a time.
 */
export function SharedDecompileView({
  id,
  view,
  createdAt
}: {
  id: string;
  view: DecompileView;
  createdAt: string;
}) {
  const router = useRouter();
  const [hoveredBlokId, setHoveredBlokId] = useState<string | null>(null);
  const [pinnedBlokId, setPinnedBlokId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removeState, removeAction, removing] = useActionState(removeDecompile, { status: "error" as const });

  const activeBlokId = pinnedBlokId ?? hoveredBlokId;
  const onHover = useCallback((blokId: string | null) => setHoveredBlokId(blokId), []);
  const onPin = useCallback((blokId: string) => setPinnedBlokId(blokId), []);
  const onUnpin = useCallback(() => setPinnedBlokId(null), []);

  useEffect(() => {
    if (removeState.status === "removed") router.refresh();
  }, [removeState, router]);

  const expiresOn = useMemo(() => {
    const created = new Date(createdAt);
    const expiry = new Date(created.getTime() + 30 * 24 * 60 * 60 * 1000);
    return expiry.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }, [createdAt]);

  const announcement = useMemo(() => {
    if (activeBlokId === null) return "";
    const blok = view.bloks.find((candidate) => candidate.id === activeBlokId);
    if (!blok) return "";
    const index = view.bloks.indexOf(blok) + 1;
    const places = blok.rangeCount === 1 ? "1 place" : `${blok.rangeCount} places`;
    return `Blok ${index}, ${blok.kind}, ${pinnedBlokId === activeBlokId ? "pinned" : "highlighted"}, ${places} in the source.`;
  }, [activeBlokId, pinnedBlokId, view]);

  return (
    <main className="decompile" id="main">
      <header className="decompile-head">
        <h1>Someone shared a prompt with you.</h1>
        <p>
          This is what is in it: named bloks, each mapped to the exact text it came from, and anything
          worth knowing about it underneath.
        </p>
      </header>

      {/*
        The removal affordance sits here, above the result, because this is the path a worried person
        uses — somebody who has realised the link contains something it should not. The epic's note is
        explicit that it must be findable without reading anything, so it is not in a footer and not
        behind a menu.
      */}
      <section className="shared-controls" aria-labelledby="shared-controls-heading">
        <h2 id="shared-controls-heading" className="sr-only">
          This link
        </h2>
        <p className="shared-retention">
          {RETENTION_SENTENCE} This one is deleted on {expiresOn}.
        </p>
        <div className="shared-actions">
          <Link className="btn" href="/decompile">
            Decompile your own
          </Link>
          {confirming ? (
            <form action={removeAction} className="shared-remove-confirm">
              <input type="hidden" name="id" value={id} />
              <span className="shared-remove-question">Delete this link for everyone?</span>
              <Button type="submit" variant="primary" disabled={removing}>
                {removing ? "Deleting…" : "Yes, delete it"}
              </Button>
              <Button type="button" onClick={() => setConfirming(false)} disabled={removing}>
                Keep it
              </Button>
            </form>
          ) : (
            <Button type="button" onClick={() => setConfirming(true)} data-testid="remove-link">
              Delete this link
            </Button>
          )}
        </div>
      </section>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>

      <KpiStrip
        items={[
          { key: "words", title: "Words", value: String(view.stats.words) },
          { key: "bloks", title: "Bloks", value: String(view.stats.bloks) },
          { key: "spans", title: "Spans", value: String(view.stats.spans) },
          { key: "findings", title: "Findings", value: String(view.stats.findings) }
        ]}
      />

      <div className="decompile-columns">
        <section className="decompile-panel" aria-labelledby="source-heading">
          <h2 id="source-heading" className="eyebrow decompile-section-heading">
            Source prompt
          </h2>
          <SourceMap
            pieces={view.pieces}
            activeBlokId={activeBlokId}
            pinnedBlokId={pinnedBlokId}
            onHover={onHover}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        </section>

        <section className="decompile-panel" aria-labelledby="bloks-heading">
          <h2 id="bloks-heading" className="eyebrow decompile-section-heading">
            Bloks
          </h2>
          <BlokList
            bloks={view.bloks}
            activeBlokId={activeBlokId}
            pinnedBlokId={pinnedBlokId}
            onHover={onHover}
            onPin={onPin}
            onUnpin={onUnpin}
          />
        </section>
      </div>

      <FindingsPanel
        findings={view.findings}
        uncheckedRules={view.uncheckedRules}
        uncheckedRuleTotal={view.uncheckedRuleTotal}
        activeBlokId={activeBlokId}
        pinnedBlokId={pinnedBlokId}
        onHover={onHover}
        onPin={onPin}
        onUnpin={onUnpin}
      />
    </main>
  );
}
