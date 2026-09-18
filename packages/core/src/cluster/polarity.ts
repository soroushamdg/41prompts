// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// Whether a piece of text asserts something, forbids something, or neither.
//
// EPIC-011a uses it to stop a rule merging with its own contradiction. EPIC-012a's `contradiction`
// detector uses it to *find* those contradictions — the same signal read for the opposite purpose,
// which is why it lives in one place rather than two.

import polarityData from "./polarity.json" with { type: "json" };

/** `negative` beats `positive`, so "must not" is negative rather than positive. */
export type Polarity = "negative" | "positive" | "neutral";

const NEGATIVE: readonly RegExp[] = polarityData.negative.map((row) => new RegExp(row.pattern, row.flags));
const POSITIVE: readonly RegExp[] = polarityData.positive.map((row) => new RegExp(row.pattern, row.flags));

/**
 * Whether a segment asserts something, forbids something, or neither.
 *
 * Checked negative-first, so "must not" is negative and not positive. Anything without a modal is
 * `neutral`, and neutral never blocks a merge — this guard exists to stop a rule merging with its
 * own contradiction, not to demand that every fragment declare a polarity.
 */
export function polarityOf(text: string): Polarity {
  for (const pattern of NEGATIVE) {
    if (pattern.test(text)) return "negative";
  }
  for (const pattern of POSITIVE) {
    if (pattern.test(text)) return "positive";
  }
  return "neutral";
}

/**
 * True when a segment is on the opposite side of a rule from anything already in the group.
 *
 * Checked against **every** fragment's polarity, not the first one's. Found in self-review: with
 * only the first fragment consulted, a neutral opening fragment let a positive and a negative rule
 * both join it, and "Always respond in JSON only." ended up in the same blok as "Never respond in
 * JSON when the caller asked for plain text." — the exact merge this guard, the false-merge fixture
 * and the README all say is impossible.
 *
 * The false-merge fixture's second case: "Always respond in JSON only." and "Never respond in JSON
 * when the caller asked for plain text." share {respond, json} out of three tokens — 0.667, over
 * the threshold — and both classify as `constraint`. Merging them hides a contradiction inside one
 * blok, where EPIC-012a's detector compares bloks and will never see it.
 *
 * The cost is real and is the cost decision 10 asks us to pay: "Always respond in JSON only" no
 * longer merges with "Do not include any explanation outside the JSON", which are two phrasings of
 * one intent. A missed merge is a blok a user can join in one gesture; a wrong merge is text hiding
 * somewhere they will not look.
 */
export function contradicts(incoming: Polarity, present: ReadonlySet<Polarity>): boolean {
  if (incoming === "positive") return present.has("negative");
  if (incoming === "negative") return present.has("positive");
  return false;
}

/** The committed polarity patterns, for the pattern-safety test. */
export function polarityPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return [
    ...polarityData.negative.map((row) => ({ id: `negative:${row.id}`, pattern: row.pattern, flags: row.flags })),
    ...polarityData.positive.map((row) => ({ id: `positive:${row.id}`, pattern: row.pattern, flags: row.flags }))
  ];
}
