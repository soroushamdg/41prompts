// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { normalise, overlap } from "../cluster/similarity.js";
import { polarityOf } from "../cluster/polarity.js";
import type { Blok } from "../cluster/types.js";
import { trimmedSentenceRanges } from "../segment/sentences.js";
import type { Range } from "../segment/types.js";
import { REPEAT_OVERLAP_THRESHOLD } from "./constants.js";
import { makeFinding, opposed, opposingAntonym, quote } from "./shared.js";
import type { Finding } from "./types.js";

// ── contradiction ────────────────────────────────────────────────────────────────────────────
//
// Works on **sentences**, not blok pairs, and that is the whole design.
//
// The decompiler prototype pairs any blok containing a negation with any blok that does not, sharing
// any one of eight hard-coded nouns. Run against its own sample that produces one false positive
// (two bloks sharing the word "summary" and contradicting nothing) and one real contradiction
// reported against the wrong pair — because the genuine one is *inside a single segment*, between
// two adjacent sentences of one paragraph.
//
// Sentences are the only unit fine enough to catch all three shapes: across two bloks, inside one
// blok (the antonym case EPIC-011a carried forward, where token overlap merges both halves into
// one), and inside one range.

export function detectContradiction(bloks: readonly Blok[], source: string): Finding[] {
  interface Span {
    readonly range: Range;
    readonly blokId: string;
    readonly vocabulary: Set<string>;
    readonly polarity: ReturnType<typeof polarityOf>;
  }

  const spans: Span[] = [];
  for (const blok of bloks) {
    for (const range of blok.ranges) {
      for (const sentence of trimmedSentenceRanges(source, range.start, range.end)) {
        const text = source.slice(sentence.start, sentence.end);
        spans.push({
          range: sentence,
          blokId: blok.id,
          vocabulary: normalise(text),
          polarity: polarityOf(text)
        });
      }
    }
  }

  const found: Finding[] = [];
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const left = spans[i]!;
      const right = spans[j]!;
      if (Math.min(left.vocabulary.size, right.vocabulary.size) < 2) continue;
      if (overlap(left.vocabulary, right.vocabulary) < REPEAT_OVERLAP_THRESHOLD) continue;

      const byPolarity = opposed(left.polarity, right.polarity);
      const byAntonym = opposingAntonym(left.vocabulary, right.vocabulary);
      if (!byPolarity && byAntonym === null) continue;

      const ranges = [left.range, right.range].sort((a, b) => a.start - b.start);
      // Deduplicated: a contradiction the clustering hid inside one blok names that one blok. The
      // alternative — listing the same id twice to satisfy "names at least two" literally — would
      // make `bloks` a bag rather than a set and push the dedupe onto every consumer.
      const blokIds = [...new Set([left.blokId, right.blokId])];
      const because =
        byAntonym === null
          ? "one forbids what the other requires"
          : `one says ${JSON.stringify(byAntonym[0])} and the other says ${JSON.stringify(byAntonym[1])}`;

      found.push(
        makeFinding("contradiction", "high", blokIds, ranges, {
          message: `These two cannot both hold — ${because}: ${quote(source, ranges[0]!)} and ${quote(source, ranges[1]!)}.`,
          suggestion: "Decide which one is right and delete the other, or say when each applies."
        })
      );
    }
  }
  return found;
}
