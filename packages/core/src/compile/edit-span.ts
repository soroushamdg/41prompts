// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Compiled } from "./types.js";

/**
 * Take one span by hand: replace its text, keep everything else.
 *
 * ## What is kept, and why it is the whole mechanism
 *
 * The span keeps **the hash it was compiled from**. That single retained value is what lets the
 * product distinguish the two facts `drift()` reports — it records *which version of the blok the
 * person was looking at when they typed*. Recomputing it here, or dropping it, would collapse "you
 * edited this" and "the blok has changed since you edited this" into one undifferentiated "this does
 * not match", which is the failure the epic names as the one to avoid.
 *
 * ## What is replaced
 *
 * `newText` replaces the blok's own text — `[start, textEnd)` — and the separator after it is left
 * alone. Separators are the compiler's business (decision 5), so a caller editing a span never has
 * to know one is there, and cannot accidentally delete the blank line that keeps two bloks apart.
 *
 * Returns a new `Compiled`; nothing is mutated. Every later span's offsets shift by the length
 * delta, and no later span's text, hash or state changes.
 */
export function editSpan(compiled: Compiled, blokId: string, newText: string): Compiled {
  const index = compiled.spans.findIndex((span) => span.blokId === blokId);
  if (index === -1) {
    throw new Error(
      `editSpan: no span for blok ${JSON.stringify(blokId)}. An expected blok compiles to a check and owns no span; ` +
        `a blok added since this was compiled has no span until it is compiled again.`
    );
  }

  const span = compiled.spans[index]!;
  const delta = newText.length - (span.textEnd - span.start);

  const text = compiled.text.slice(0, span.start) + newText + compiled.text.slice(span.textEnd);
  const spans = compiled.spans.map((other, i) => {
    if (i < index) return other;
    if (i === index) {
      return {
        ...other,
        textEnd: other.textEnd + delta,
        end: other.end + delta,
        // Kept, not recomputed. See above.
        state: "edited by hand" as const
      };
    }
    return { ...other, start: other.start + delta, textEnd: other.textEnd + delta, end: other.end + delta };
  });

  return { ...compiled, text, spans };
}
