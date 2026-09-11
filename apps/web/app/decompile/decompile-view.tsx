"use client";

import { Button, EmptyCanvasIllustration, KpiStrip, Textarea } from "@41prompts/ui";
import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { INITIAL_STATE, kilobytes, MAX_INPUT_BYTES, tooLongMessage, type DecompileState } from "@/lib/decompile/limits";
import { decompile } from "./actions";
import { BlokList } from "./blok-list";
import { FindingsPanel } from "./findings-panel";
import { SharePanel } from "./share-panel";
import { SourceMap } from "./source-map";

/**
 * Everything the reader interacts with. State here is only *which blok is under the pointer* and
 * *which is pinned* — the algorithms all ran on the server (epic decision 1), and what crossed is
 * plain data.
 */
export function DecompileView({ turnstileSiteKey }: { turnstileSiteKey: string | null }) {
  const [state, formAction, pending] = useActionState<DecompileState, FormData>(decompile, INITIAL_STATE);
  const [hoveredBlokId, setHoveredBlokId] = useState<string | null>(null);
  const [pinnedBlokId, setPinnedBlokId] = useState<string | null>(null);

  // A pin survives the pointer moving away (epic decision 3); hover only shows through when nothing
  // is pinned, or moving the mouse would silently undo a deliberate choice.
  const activeBlokId = pinnedBlokId ?? hoveredBlokId;

  const view = state.status === "ok" ? state.view : null;

  const onHover = useCallback((blokId: string | null) => setHoveredBlokId(blokId), []);
  const onPin = useCallback((blokId: string) => setPinnedBlokId(blokId), []);
  const onUnpin = useCallback(() => setPinnedBlokId(null), []);

  /**
   * **Touch is the default interaction, not a degraded hover** (epic decision 3, and the roadmap's
   * "touch default: first blok pinned with a one-line hint on small screens").
   *
   * A phone has no hover, so a source map whose linking is only discoverable by pointing is a source
   * map a phone user never learns is interactive at all. On a small screen the first blok arrives
   * already pinned, with one line saying what that means — the affordance is demonstrated rather
   * than described.
   *
   * This is also where EPIC-080's cut lands: that study would have measured whether tap-to-pin is
   * discoverable within 30 seconds, and with it gone this is the answer taken on the prototypes'
   * authority. Read against the funnel in EPIC-084, not before.
   *
   * In an effect rather than in render, because `matchMedia` does not exist on the server and a
   * pin decided during render would differ between the server's HTML and the client's first paint.
   */
  const [isSmall, setIsSmall] = useState(false);
  const autoPinnedFor = useRef<string | null>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1019px)");
    const update = () => setIsSmall(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!isSmall || state.status !== "ok") return;
    const first = state.view.bloks[0];
    if (!first || autoPinnedFor.current === state.source) return;
    autoPinnedFor.current = state.source;
    setPinnedBlokId(first.id);
  }, [isSmall, state]);

  /**
   * What assistive technology is told when the highlight moves (epic decision 8). The change must be
   * announced, not merely shown — a highlight that only exists as an ink inversion is invisible to a
   * screen reader, and "highlighting must be announced" is the criterion, not "highlighting must
   * have an accessible colour".
   */
  const announcement = useMemo(() => {
    if (!view || activeBlokId === null) return "";
    const blok = view.bloks.find((candidate) => candidate.id === activeBlokId);
    if (!blok) return "";
    const index = view.bloks.indexOf(blok) + 1;
    const places = blok.rangeCount === 1 ? "1 place" : `${blok.rangeCount} places`;
    return `Blok ${index}, ${blok.kind}, ${pinnedBlokId === activeBlokId ? "pinned" : "highlighted"}, ${places} in the source.`;
  }, [activeBlokId, pinnedBlokId, view]);

  return (
    <>
      <form action={formAction} className="decompile-form">
        <label htmlFor="prompt" className="eyebrow">
          Your prompt
        </label>
        <Textarea
          id="prompt"
          name="prompt"
          rows={12}
          spellCheck={false}
          placeholder="Paste a prompt…"
          defaultValue={state.status === "ok" ? state.source : ""}
        />
        <div className="decompile-actions">
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Reading…" : "Decompile"}
          </Button>
          <Button type="submit" name="sample" value="1" disabled={pending}>
            Use a sample prompt
          </Button>
          <span className="decompile-limit">Up to {kilobytes(MAX_INPUT_BYTES)}. Nothing is stored.</span>
        </div>
      </form>

      {state.status === "rate-limited" && (
        <p className="decompile-notice" role="alert">
          {state.message}
        </p>
      )}

      {state.status === "too-long" && (
        <p className="decompile-notice" role="alert">
          {tooLongMessage(state.bytes)}
        </p>
      )}

      {(state.status === "idle" || state.status === "empty") && (
        <div className="decompile-empty">
          <EmptyCanvasIllustration />
          <p className="decompile-empty-title">
            {state.status === "empty" ? "There was nothing in the box." : "Paste a prompt to see what is in it."}
          </p>
          <p className="decompile-empty-body">
            It comes back as named bloks, mapped to the exact text they came from, with anything worth
            knowing about it listed underneath. No account, nothing stored.
          </p>
        </div>
      )}

      {view && (
        <>
          <p className="sr-only" role="status" aria-live="polite">
            {announcement}
          </p>

          {isSmall && (
            <p className="decompile-touch-hint">
              The first blok is pinned. Tap any blok, or any highlighted text, to pin that one instead.
            </p>
          )}

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

          <SharePanel source={state.status === "ok" ? state.source : ""} turnstileSiteKey={turnstileSiteKey} />

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
        </>
      )}
    </>
  );
}
