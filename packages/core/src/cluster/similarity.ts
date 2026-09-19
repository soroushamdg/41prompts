// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// How two pieces of text are compared, extracted so there is exactly one answer to "are these the
// same thing?" in this package.
//
// EPIC-011a used it to decide merges. EPIC-012a's `repeated` and `contradiction` detectors use the
// same measure and the same threshold, because decision 6 of that epic says so and because a second
// similarity measure would mean a pair of rules could be "similar enough to merge" and "not similar
// enough to report" at the same time, which is not a thing anybody could explain to a user.

import stopwordsData from "./stopwords.json" with { type: "json" };

export const MERGE_OVERLAP_THRESHOLD = 0.6;

const STOPWORDS: ReadonlySet<string> = new Set(stopwordsData);

/** Words this short carry no topic. The prototype's rule, kept as-is. */
const MIN_TOKEN_LENGTH = 3;

/**
 * How many normalised tokens the smaller of two segments must have before token overlap is allowed
 * to merge them at all.
 *
 * Added because the false-merge fixture proved it necessary, not on principle. Normalisation drops
 * words of three characters or fewer, so "Use markdown." reduces to the single token `{markdown}`,
 * and one shared token out of one scores 1.0 — the highest the measure can produce, on the least
 * evidence it can have. At 1 this files a heading-style rule inside a "use markdown" blok.
 */
export const MIN_OVERLAP_TOKENS = 2;

/**
 * How many times larger one segment's vocabulary may be than the other's before token overlap is
 * allowed to merge them.
 *
 * `overlap()` divides by the *smaller* vocabulary, which is the prototype's measure and which means
 * containment scores a perfect 1.0: a three-token rule whose every word appears somewhere in a
 * forty-word paragraph is "100% overlapping" with it. Found in self-review — "Always use JSON
 * format." swallowed an entire audit-logging paragraph — and `MIN_OVERLAP_TOKENS` does not help,
 * because the smaller side still has two tokens.
 *
 * A restatement of the same rule is roughly the same length as the rule. A vocabulary three times
 * the size is elaborating on a subject, not repeating an instruction.
 */
export const MAX_VOCABULARY_RATIO = 3;

/**
 * Lowercase, drop everything that is not a letter, digit or underscore, split on whitespace, drop
 * short words and stop words. The prototype's normalisation, kept as-is.
 *
 * No stemming. It is locale-sensitive, and a merge that depends on which locale the process happens
 * to be running in is not deterministic (decision 7).
 */
export function normalise(text: string): Set<string> {
  const words = new Set<string>();
  for (const word of text.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/)) {
    if (word.length > MIN_TOKEN_LENGTH && !STOPWORDS.has(word)) words.add(word);
  }
  return words;
}

/** Shared vocabulary as a fraction of the smaller segment's, in `[0, 1]`. */
export function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

