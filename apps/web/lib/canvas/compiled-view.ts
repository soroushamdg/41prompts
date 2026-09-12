import { drift, type Compiled, type PromptBlok, type SpanState } from "@41prompts/core";
import { toDisplayText } from "@/lib/site/display-text";

/**
 * The compiled prompt as the pane renders it: one piece per span, in order, carrying the state the
 * pane has to express.
 *
 * ## Offsets and the DOM
 *
 * **Offsets stay in compiled-text space; the DOM carries display text; `toDisplayText` is the only
 * thing between them.** EPIC-013 got this wrong twice in opposite directions and its report is worth
 * reading before touching this: React writes a raw `\r` into the server-rendered HTML and the HTML
 * parser replaces `\r\n` with `\n` before any script runs, so `textContent` can never equal a raw
 * source slice for CRLF text and hydration breaks on every Windows-pasted prompt without it.
 *
 * That matters here more than it did there. A blok's text is stored byte for byte (EPIC-021a), and a
 * browser normalises a `<textarea>` to CRLF on submit — so the compiled text routinely *contains*
 * CRLF, and this is the common path rather than an edge case.
 *
 * ## The separator is carried, not dropped
 *
 * EPIC-020 gives each span its blok's text **and** the separator that follows it, with `textEnd` as
 * the boundary. The pane renders the blok's text as the span and the separator outside it, so the
 * highlight covers exactly the blok's characters and the blank line between spans belongs to
 * neither. Concatenating `text + separator` over every piece reconstructs the whole prompt, which is
 * the property the exactness test rests on.
 */

/** Which of the four things the pane says about a span. */
export type SpanPresentation = "in-step" | "edited" | "edited-changed" | "out-of-date";

export interface CompiledPiece {
  readonly blokId: string;
  /** The blok's own characters, in DOM space. */
  readonly text: string;
  /** The separator that follows, in DOM space. Outside the highlight. */
  readonly separator: string;
  readonly state: SpanState;
  readonly textDiffersFromBlok: boolean;
  readonly blokChangedSinceSpan: boolean;
  readonly presentation: SpanPresentation;
}

/**
 * Which sentence a span gets.
 *
 * The fifth reachable cell — `compiled`, text matches, hash stale, which is a blok whose *kind*
 * changed and whose text did not — falls through to `in-step` **on purpose**. There is nothing the
 * reader can do about it and nothing they lose by not knowing. `compiled-view.test.ts` asserts that
 * silence rather than letting it pass unnoticed.
 *
 * A `compiled` span whose text differs is reported as out of date whatever its hash says. That
 * combination should not come out of `compile()` at all; if it ever does, the honest thing to tell
 * somebody is that the span is not what its blok says.
 */
function presentationFor(state: SpanState, differs: boolean, changed: boolean): SpanPresentation {
  if (state === "edited by hand") return changed ? "edited-changed" : "edited";
  return differs ? "out-of-date" : "in-step";
}

export function compiledView(compiled: Compiled, bloks: readonly PromptBlok[]): CompiledPiece[] {
  const report = drift(compiled, bloks);
  const byId = new Map(report.spans.map((span) => [span.blokId, span]));

  return compiled.spans.map((span) => {
    const row = byId.get(span.blokId);
    const differs = row?.textDiffersFromBlok ?? false;
    const changed = row?.blokChangedSinceSpan ?? false;
    return {
      blokId: span.blokId,
      text: toDisplayText(compiled.text.slice(span.start, span.textEnd)),
      separator: toDisplayText(compiled.text.slice(span.textEnd, span.end)),
      state: span.state,
      textDiffersFromBlok: differs,
      blokChangedSinceSpan: changed,
      presentation: presentationFor(span.state, differs, changed),
    };
  });
}

/** What the pane says for each presentation. The wording is ruled; see EPIC-021b's report §1. */
export const SPAN_SENTENCE: Readonly<Record<SpanPresentation, string>> = {
  "in-step": "",
  edited: "You wrote this span. Update from blok replaces it with what the blok says.",
  "edited-changed":
    "You wrote this span, and its blok has changed since. Update from blok replaces it with the blok's new wording; check the card first.",
  "out-of-date":
    "This span is what its blok said before it changed. Update from blok brings it up to date; nothing you wrote is lost, because you wrote none of it.",
};

/** The short marker beside the span. Never the only signal — the sentence above always accompanies it. */
export const SPAN_BADGE: Readonly<Record<SpanPresentation, string>> = {
  "in-step": "",
  edited: "edited by hand",
  "edited-changed": "edited by hand · blok changed",
  "out-of-date": "out of date",
};

/**
 * Amber is drift and only drift (rule 10, decision 4).
 *
 * Drift is `blokChangedSinceSpan`, so it is exactly the two presentations where the blok has moved.
 * A hand edit whose blok has not moved is a choice somebody made, not drift, and must not carry it.
 */
export function isDrift(presentation: SpanPresentation): boolean {
  return presentation === "edited-changed" || presentation === "out-of-date";
}
