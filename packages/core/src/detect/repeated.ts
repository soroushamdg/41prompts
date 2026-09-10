// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { normalise, overlap } from "../cluster/similarity.js";
import { polarityOf } from "../cluster/polarity.js";
import type { Blok } from "../cluster/types.js";
import { MAX_VOCABULARY_RATIO } from "../cluster/similarity.js";
import { REPEAT_OVERLAP_THRESHOLD } from "./constants.js";
import { blokText, makeFinding, opposed, quote, toRange } from "./shared.js";
import type { Finding } from "./types.js";

// ── repeated ─────────────────────────────────────────────────────────────────────────────────
//
// Two bloks that say substantially the same thing. Fires **across** bloks, never inside one
// (decision 6) — a blok with three ranges is not a finding, it is what clustering is for, and
// EPIC-013 shows the range count on the card.
//
// The prototype's version counted a blok's own fragments, which under EPIC-011a's clustering is not
// a defect at all. And a naive port of "overlap ≥ threshold" would never fire, because any two
// bloks over the threshold that share a kind were *already merged into one blok*. What is left —
// and what this reports — is the pair clustering deliberately refused: the same instruction said
// twice in two different registers, once as role context and once as a numbered rule. Those are
// genuinely two places a user has to edit, and nothing else in the product points at them.

export function detectRepeated(bloks: readonly Blok[], source: string): Finding[] {
  const texts = bloks.map((blok) => blokText(blok, source));
  const vocabularies = texts.map((text) => normalise(text));
  const polarities = texts.map((text) => polarityOf(text));

  // Indexed by token, like `cluster()` and for the same reason: comparing every blok against every
  // other is quadratic in a function EPIC-013 runs on the main thread. A pair can only clear the
  // threshold with at least two tokens in common, so counting shared tokens skips the rest.
  const byToken = new Map<string, number[]>();
  const found: Finding[] = [];

  for (let i = 0; i < bloks.length; i++) {
    const vocabulary = vocabularies[i]!;
    if (vocabulary.size >= MIN_REPEAT_TOKENS) {
      const shared = new Map<number, number>();
      for (const word of vocabulary) {
        for (const candidate of byToken.get(word) ?? []) shared.set(candidate, (shared.get(candidate) ?? 0) + 1);
      }

      for (const [candidate, count] of [...shared].sort((a, b) => a[0] - b[0])) {
        if (count < 2) continue;
        const other = vocabularies[candidate]!;
        // A polarity mismatch means these disagree rather than repeat. That is the other detector's
        // finding, and reporting it here as well would put two findings on one problem.
        if (opposed(polarities[candidate]!, polarities[i]!)) continue;
        if (other.size < MIN_REPEAT_TOKENS) continue;
        // The containment guard clustering applies alongside this threshold, dropped on the way
        // over: without it a short rule whose every word appears somewhere in a long paragraph
        // scores a perfect 1.0. Found in review.
        const smaller = Math.min(other.size, vocabulary.size);
        const larger = Math.max(other.size, vocabulary.size);
        if (larger > smaller * MAX_VOCABULARY_RATIO) continue;
        if (overlap(other, vocabulary) < REPEAT_OVERLAP_THRESHOLD) continue;

        const first = bloks[candidate]!;
        const second = bloks[i]!;
        const ranges = [...first.ranges, ...second.ranges].map(toRange).sort((a, b) => a.start - b.start);
        // Quoted one range from *each* blok, not the first and last of the merged list. When one
        // blok's ranges bracket the other's, first-and-last are two fragments of the same blok and
        // the message never shows what it was compared against. Found in review.
        found.push(
          makeFinding("repeated", "medium", [first.id, second.id], ranges, {
            message: `Two bloks say the same thing: ${quote(source, first.ranges[0]!)} and ${quote(source, second.ranges[0]!)}. Editing one leaves the other in place.`,
            suggestion: "Keep one of them and delete the other, or join them into one blok."
          })
        );
      }
    }

    for (const word of vocabulary) {
      const bucket = byToken.get(word);
      if (bucket === undefined) byToken.set(word, [i]);
      else bucket.push(i);
    }
  }

  return found;
}

/**
 * How many normalised tokens a blok needs before it can be called a repeat of another.
 *
 * Four, not three. At three, two shared tokens score 0.667 and clear the threshold on the thinnest
 * evidence the measure can carry — "You triage billing questions." and "Always escalate billing
 * questions to a human agent." share only their subject, and calling them the same instruction is
 * exactly the finding a reader would disagree with. The same failure shape as EPIC-011a's
 * `MIN_OVERLAP_TOKENS`, one size up, and found the same way: by a fixture that said it must not fire.
 */
const MIN_REPEAT_TOKENS = 4;
