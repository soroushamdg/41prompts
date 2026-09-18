// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { normalise, overlap } from "../cluster/similarity.js";
import { polarityOf } from "../cluster/polarity.js";
import type { Blok } from "../cluster/types.js";
import { trimmedSentenceRanges } from "../segment/sentences.js";
import type { Range } from "../segment/types.js";
import { MAX_VOCABULARY_RATIO } from "../cluster/similarity.js";
import { REPEAT_OVERLAP_THRESHOLD } from "./constants.js";
import { antonymPartnersIn, antonymWordsIn, makeFinding, opposed, opposingAntonym, quote } from "./shared.js";
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

export /**
 * A negation that is *scoped* by a condition is a precondition, not a contradiction.
 *
 * "Do not escalate billing questions until you have checked the FAQ" refines "Always escalate
 * billing questions" — it says *when*, not *whether*. Without this guard that pair fires at
 * severity `high`, which is the most expensive kind of false positive there is. Found in review;
 * `quiet-scoped-precondition` pins it.
 */
const SCOPED = /\b(?:until|unless|before|after|except|while|whenever|once|when|if)\b/i;

interface Span {
  readonly range: Range;
  readonly blokId: string;
  readonly text: string;
  readonly vocabulary: Set<string>;
  readonly polarity: ReturnType<typeof polarityOf>;
}

export function detectContradiction(bloks: readonly Blok[], source: string): Finding[] {
  const spans: Span[] = [];
  for (const blok of bloks) {
    for (const range of blok.ranges) {
      for (const sentence of trimmedSentenceRanges(source, range.start, range.end)) {
        const text = source.slice(sentence.start, sentence.end);
        spans.push({
          range: sentence,
          blokId: blok.id,
          text,
          vocabulary: normalise(text),
          polarity: polarityOf(text)
        });
      }
    }
  }

  // Indexed by what a contradiction actually *requires*, not merely by shared tokens.
  //
  // A token index alone does not prune a repetitive prompt: a corpus repeated thirty-five times
  // gives every sentence thirty-five identical twins that share every token, so the candidate set
  // stays enormous and the comparison stays quadratic. Measured that way, a 1 MB prompt took 12.6
  // seconds; indexing on tokens alone only brought it to 6.2, still growing as input^1.9.
  //
  // But a contradiction needs *opposition*: either the two sentences oppose in polarity, or one
  // carries an antonym whose partner the other carries. So a positive sentence only ever needs to
  // be compared against negative ones, and an antonym-bearing sentence only against sentences
  // bearing its partner. Identical twins share a polarity and can never contradict each other,
  // which is exactly the mass this skips.
  const byPolarityToken = { positive: new Map<string, number[]>(), negative: new Map<string, number[]>() };
  const byAntonymWord = new Map<string, number[]>();
  const found: Finding[] = [];

  const add = (index: Map<string, number[]>, key: string, value: number): void => {
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [value]);
    else bucket.push(value);
  };

  for (let i = 0; i < spans.length; i++) {
    const span = spans[i]!;
    if (span.vocabulary.size >= MIN_CONTRADICTION_TOKENS) {
      const candidates = new Map<number, number>();

      // The polarity path: look only at spans of the opposite polarity.
      if (span.polarity === "positive" || span.polarity === "negative") {
        const opposite = span.polarity === "positive" ? byPolarityToken.negative : byPolarityToken.positive;
        for (const word of span.vocabulary) {
          for (const candidate of opposite.get(word) ?? []) candidates.set(candidate, (candidates.get(candidate) ?? 0) + 1);
        }
      }

      // The antonym path: look only at spans carrying this one's opposite word.
      for (const partner of antonymPartnersIn(span.text)) {
        for (const candidate of byAntonymWord.get(partner) ?? []) candidates.set(candidate, (candidates.get(candidate) ?? 0) + 2);
      }

      for (const [candidate, weight] of [...candidates].sort((a, b) => a[0] - b[0])) {
        // Two shared tokens is the least a pair can have and still clear the threshold
        // (`ceil(0.6 * 2)`); an antonym hit is admitted on its own.
        if (weight < 2) continue;
        const finding = contradictionBetween(spans[candidate]!, span, source);
        if (finding !== null) found.push(finding);
      }
    }

    if (span.polarity === "positive" || span.polarity === "negative") {
      for (const word of span.vocabulary) add(byPolarityToken[span.polarity], word, i);
    }
    for (const word of antonymWordsIn(span.text)) add(byAntonymWord, word, i);
  }

  return found;
}

/** How many normalised tokens a sentence needs before it can contradict anything. */
const MIN_CONTRADICTION_TOKENS = 2;

function contradictionBetween(left: Span, right: Span, source: string): Finding | null {
  const smaller = Math.min(left.vocabulary.size, right.vocabulary.size);
  const larger = Math.max(left.vocabulary.size, right.vocabulary.size);
  if (smaller < MIN_CONTRADICTION_TOKENS) return null;
  // The same containment guard clustering applies alongside this threshold. Without it a
  // three-token rule whose every word appears somewhere in a sixty-word paragraph scores a perfect
  // 1.0 — the exact case `similarity.ts` documents, dropped on the way over. Found in review.
  if (larger > smaller * MAX_VOCABULARY_RATIO) return null;
  if (overlap(left.vocabulary, right.vocabulary) < REPEAT_OVERLAP_THRESHOLD) return null;

  const byPolarity = opposed(left.polarity, right.polarity);
  const byAntonym = opposingAntonym(left.text, right.text);
  if (!byPolarity && byAntonym === null) return null;

  // A scoped negation says when, not whether.
  if (byPolarity && (SCOPED.test(left.text) || SCOPED.test(right.text))) return null;

  const ranges = [left.range, right.range].sort((a, b) => a.start - b.start);
  // Deduplicated: a contradiction the clustering hid inside one blok names that one blok. The
  // alternative — listing the same id twice to satisfy "names at least two" literally — would make
  // `bloks` a bag rather than a set and push the dedupe onto every consumer.
  const blokIds = [...new Set([left.blokId, right.blokId])];
  const because =
    byAntonym === null
      ? "one forbids what the other requires"
      : `one says ${JSON.stringify(byAntonym[0])} and the other says ${JSON.stringify(byAntonym[1])}`;

  return makeFinding("contradiction", "high", blokIds, ranges, {
    message: `These two cannot both hold — ${because}: ${quote(source, ranges[0]!)} and ${quote(source, ranges[1]!)}.`,
    suggestion: "Decide which one is right and delete the other, or say when each applies."
  });
}
