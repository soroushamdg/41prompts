// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { blokHash } from "./hash.js";
import type { Compiled, DriftReport, PromptBlok, SpanDrift } from "./types.js";

/**
 * What is stale in this compiled prompt, asked as a question.
 *
 * ## Two facts, not one flag — the thing this epic exists to get right
 *
 * A span carries **two independent pieces of information**, and a model with a single "out of date"
 * flag cannot hold both:
 *
 * | | what it is computed from | what it means |
 * |---|---|---|
 * | `textDiffersFromBlok` | the span's text against what the blok compiles to **now** | what is in the output is not what this blok says |
 * | `blokChangedSinceSpan` | the blok's hash against the hash the span kept | the blok has moved on since this span was compiled or edited |
 *
 * They are independent, and every one of the four combinations is reachable:
 *
 * - **differs, unchanged.** A span edited by hand whose blok nobody has touched. The output differs
 *   from the blok; the blok is where it was. Badge: "edited by hand".
 * - **matches, changed.** A blok reclassified `context` → `constraint`. `blokHash` covers the kind,
 *   so it changes; `render` is identity on text, so the output is byte-identical. **This is the case
 *   that rules out a single flag**: a model keyed on "does the text still match" calls this in sync
 *   and serves a cached span addressed by a hash that no longer exists.
 * - **differs, changed.** Somebody edited the span by hand, and *then* the blok changed. Both facts
 *   are true and the reader needs both sentences; "edited by hand" alone is a lie of omission, and
 *   "out of date" alone throws away the fact that a person typed that text on purpose.
 * - **matches, unchanged.** In sync. Nothing to say.
 *
 * `state` is reported alongside them because the booleans alone still cannot separate two cases the
 * UI shows differently: *(edited by hand, blok changed)* and *(compiled, blok changed)* have the same
 * two booleans and are "you changed this and the blok has since changed too" against "this is out of
 * date". Three fields, and the mockup's single banner is narrower than all of them — noted in the
 * report.
 *
 * ## A query, not a state machine (decision 9)
 *
 * Pure, and pure in the way that matters: no clock, no global, no module state, no memo, no
 * subscription, no stored drift anywhere. Call it when something needs to know. The moment drift
 * becomes stored state, two things can disagree about it, and the one that is wrong is invisible.
 */
export function drift(compiled: Compiled, bloks: readonly PromptBlok[]): DriftReport {
  const byId = new Map(bloks.map((blok) => [blok.id, blok]));
  const spanIds = new Set(compiled.spans.map((span) => span.blokId));

  const spans: SpanDrift[] = [];
  const removedBlokIds: string[] = [];

  for (const span of compiled.spans) {
    const blok = byId.get(span.blokId);
    if (blok === undefined) {
      // Reported, not thrown on. A UI asking "what is stale" in the middle of an edit is the normal
      // case — someone has just deleted a card — and a query that throws during ordinary use is a
      // query nobody can call.
      removedBlokIds.push(span.blokId);
      continue;
    }

    // An expected blok emits no text at all, so its span — which should not exist — differs from
    // everything the blok now compiles to. `""` is the honest comparison: it is what this blok
    // contributes to the output.
    const compilesTo = blok.kind === "expected" ? "" : blok.text;

    spans.push({
      blokId: span.blokId,
      state: span.state,
      textDiffersFromBlok: compiled.text.slice(span.start, span.textEnd) !== compilesTo,
      blokChangedSinceSpan: blokHash(blok) !== span.hash
    });
  }

  const addedBlokIds = bloks
    // `expected` bloks are left out deliberately. They legitimately own no span, and listing every
    // one of them as missing would make this list noise — and a list that is usually noise is one
    // people learn to skip past.
    .filter((blok) => blok.kind !== "expected" && !spanIds.has(blok.id))
    .map((blok) => blok.id);

  return { spans, addedBlokIds, removedBlokIds };
}
