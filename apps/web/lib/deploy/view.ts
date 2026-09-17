import type { GateRowKind, GateVerdict } from "@41prompts/core";
import type { PublishEventKind } from "@41prompts/db";

/**
 * How the Deploy page reads (EPIC-055).
 *
 * Presentation only, and pure, so the vocabulary rules are testable without a browser. The gate's
 * **sentences** are `words.ts`'s `gatePhrase` and are not repeated here — this is the layer above
 * them: titles, verdict words, the version vocabulary, and what the history's kinds are called.
 */

/**
 * `Live vM`.
 *
 * `versionName()` in `lib/versions/view.ts` gives `Draft vN` and is deliberately the only way that
 * string is written. This is its counterpart, and the two together are the whole of the version
 * vocabulary `docs/design/README.md` fixes: *"one vocabulary everywhere: 'Draft v7' and 'Live v6'.
 * Not 'v7 · unsaved', not 'v7 · current'."*
 */
export function liveName(versionN: number): string {
  return `Live v${versionN}`;
}

/** The title of each gate row. The sentence beneath it is `gatePhrase`. */
export const GATE_TITLES: Record<GateRowKind, string> = {
  checks: "Checks on this model",
  contract: "Inputs compatible with shipped apps",
  cost: "Cost per call",
  diff: "Bloks changed since Live",
};

/**
 * The word beside the glyph, so a verdict is never carried by colour alone (`CLAUDE.md` rule 10).
 *
 * `StatusIcon`'s shape does half of it and this does the other half. Rule 10's second sentence is
 * "Pass/fail is never shown by colour alone", and a glyph a person cannot name is not much better
 * than a colour — a screen reader reads this, and so does anybody who is not sure what ✓ means here.
 */
export const VERDICT_WORDS: Record<GateVerdict, string> = {
  pass: "Passed",
  fail: "Failed",
  // The one verdict amber is for. `CLAUDE.md` rule 10 reserves it for drift and nothing else, which
  // is why the cost row is ink even when it has moved by more than anybody would like.
  drift: "Moved",
  info: "For information",
};

/**
 * Whether a row's failure stops the publish, as a phrase.
 *
 * `GateRow.blocking` is a property of the kind, not of the evaluation, so this says what the row
 * costs rather than what happened — which is the thing a person wants when they are looking at a
 * red row and deciding whether to argue with it.
 */
export function blockingWords(blocking: boolean, verdict: GateVerdict): string {
  if (verdict !== "fail") return blocking ? "This must pass before Live moves." : "This never stops a publish.";
  return blocking ? "This is stopping the publish." : "This does not stop the publish.";
}

/** What the history's three kinds are called. ADR-003's words, not the column's. */
export const HISTORY_WORDS: Record<PublishEventKind, string> = {
  published: "Published",
  published_anyway: "Published anyway",
  undone: "Undone",
};

/**
 * A build hash, shortened for display.
 *
 * **Twelve characters, and the full value stays in the DOM** as the element's title and in the copy
 * control's payload. The roadmap's "no bare shas in copy" is about a hash standing in for a version
 * — which is what the mockup's `pr_9f2c4a71 · sha 3ab19c…` subtitle does — not about hiding it from
 * somebody who is working out which build an SDK resolved. It appears once per page, labelled.
 */
export function shortBuild(buildHash: string): string {
  return buildHash.slice(0, 12);
}
