// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { classify } from "../classify/classify.js";
import type { BlokKind } from "../classify/types.js";
import type { Range, Segment } from "../segment/types.js";
import polarityData from "./polarity.json" with { type: "json" };
import stopwordsData from "./stopwords.json" with { type: "json" };
import topicsData from "./topics.json" with { type: "json" };
import type { Blok } from "./types.js";

/**
 * How much of the smaller segment's vocabulary two segments must share before token overlap alone
 * is allowed to merge them (decision 7). Not configurable at run time on purpose: a threshold that
 * varies per caller is a threshold no snapshot can pin down.
 */
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
const MIN_OVERLAP_TOKENS = 2;

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
const MAX_VOCABULARY_RATIO = 3;

/** `negative` beats `positive`, so "must not" is negative rather than positive. */
type Polarity = "negative" | "positive" | "neutral";

const NEGATIVE: readonly RegExp[] = polarityData.negative.map((row) => new RegExp(row.pattern, row.flags));
const POSITIVE: readonly RegExp[] = polarityData.positive.map((row) => new RegExp(row.pattern, row.flags));

/**
 * Whether a segment asserts something, forbids something, or neither.
 *
 * Checked negative-first, so "must not" is negative and not positive. Anything without a modal is
 * `neutral`, and neutral never blocks a merge — this guard exists to stop a rule merging with its
 * own contradiction, not to demand that every fragment declare a polarity.
 */
function polarityOf(text: string): Polarity {
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
function contradicts(incoming: Polarity, present: ReadonlySet<Polarity>): boolean {
  if (incoming === "positive") return present.has("negative");
  if (incoming === "negative") return present.has("positive");
  return false;
}

interface Topic {
  readonly key: string;
  readonly test: RegExp;
}

const TOPICS: readonly Topic[] = topicsData.map((row) => ({
  key: row.key,
  test: new RegExp(row.pattern, row.flags)
}));

/**
 * Lowercase, drop everything that is not a letter, digit or underscore, split on whitespace, drop
 * short words and stop words. The prototype's normalisation, kept as-is.
 *
 * No stemming. It is locale-sensitive, and a merge that depends on which locale the process happens
 * to be running in is not deterministic (decision 7).
 */
function normalise(text: string): Set<string> {
  const words = new Set<string>();
  for (const word of text.toLowerCase().replace(/[^a-z0-9_\s]/g, " ").split(/\s+/)) {
    if (word.length > MIN_TOKEN_LENGTH && !STOPWORDS.has(word)) words.add(word);
  }
  return words;
}

/** Shared vocabulary as a fraction of the smaller segment's, in `[0, 1]`. */
function overlap(left: Set<string>, right: Set<string>): number {
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const word of left) {
    if (right.has(word)) shared += 1;
  }
  return shared / Math.min(left.size, right.size);
}

/** The first topic key that matches, or `null`. File order is precedence. */
function topicOf(text: string): string | null {
  for (const topic of TOPICS) {
    if (topic.test.test(text)) return topic.key;
  }
  return null;
}

/**
 * Sixteen hex digits of FNV-1a, run twice from different offset bases and concatenated. Small,
 * dependency-free, and stable across engines and versions.
 *
 * Two rounds rather than one because eight hex digits is 32 bits, and a 1 MB prompt produces about
 * 11,500 bloks — a birthday collision chance near 1.5%, which is not "unique by construction", it is
 * a coin flip that trips `checkBlokInvariants` once in every few dozen big prompts. Sixty-four bits
 * puts it past 1 in 10^10.
 */
function hash(input: string): string {
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    low ^= code;
    low = Math.imul(low, 0x01000193) >>> 0;
    high ^= code + i;
    high = Math.imul(high, 0x85ebca6b) >>> 0;
  }
  return high.toString(16).padStart(8, "0") + low.toString(16).padStart(8, "0");
}

interface Group {
  readonly kind: BlokKind;
  readonly topic: string | null;
  /** The normalised vocabulary of the group's first fragment, computed once. */
  readonly vocabulary: Set<string>;
  /** Every polarity present in the group, so a contradiction with any fragment blocks a merge. */
  readonly polarities: Set<Polarity>;
  readonly ranges: Range[];
  readonly texts: string[];
}

/**
 * Group segments into bloks: a rule said in three places becomes one blok owning three ranges.
 *
 * Two segments join when they share a kind and either a topic key or enough normalised-token
 * overlap (decision 7).
 *
 * Everything else about this rule is conservative by construction, because decision 10 ranks the
 * two failures and they are not symmetric. A missed merge leaves the user two bloks they can join
 * in one gesture. A wrong merge hides text inside a blok they never expected to own it — and hides
 * a contradiction from EPIC-012a, whose detector compares bloks and cannot see inside one.
 */
export function cluster(segments: readonly Segment[]): Blok[] {
  const groups: Group[] = [];

  // Two indexes, so a segment does not have to be compared against every group that came before it.
  // Without them this is O(n^2) in segment count — measured at 57 ms for 1,000 mutually distinct
  // segments and 726 ms for 4,000 — and EPIC-013 runs this in a browser tab on whatever somebody
  // pastes. Both indexes only ever *narrow* the candidate list; the candidates are then evaluated in
  // group-creation order against exactly the conditions the unindexed loop used, so the result is
  // identical, which the committed snapshots check.
  const byTopic = new Map<string, number[]>();
  const byToken = new Map<string, number[]>();

  const push = (index: Map<string, number[]>, key: string, value: number): void => {
    const bucket = index.get(key);
    if (bucket === undefined) index.set(key, [value]);
    else bucket.push(value);
  };

  for (const segment of segments) {
    const { kind } = classify(segment);
    const topic = topicOf(segment.text);
    const vocabulary = normalise(segment.text);
    const polarity = polarityOf(segment.text);

    // A merge on token overlap needs at least `ceil(0.6 * MIN_OVERLAP_TOKENS)` = 2 shared tokens,
    // so any group that could possibly qualify appears in at least two of this segment's token
    // buckets. Counting occurrences is a sound way to skip the rest.
    const shared = new Map<number, number>();
    for (const word of vocabulary) {
      for (const candidate of byToken.get(word) ?? []) {
        shared.set(candidate, (shared.get(candidate) ?? 0) + 1);
      }
    }

    const candidates = new Set<number>();
    if (topic !== null) {
      for (const candidate of byTopic.get(`${kind}\u0000${topic}`) ?? []) candidates.add(candidate);
    }
    for (const [candidate, count] of shared) {
      if (count >= 2) candidates.add(candidate);
    }

    let joined: Group | undefined;
    for (const index of [...candidates].sort((left, right) => left - right)) {
      const group = groups[index]!;
      if (group.kind !== kind) continue;
      // Checked before either merge path, so a contradiction is never merged however strong the
      // other evidence looks.
      if (contradicts(polarity, group.polarities)) continue;

      const sameTopic = topic !== null && group.topic === topic;
      // Compared against the group's first fragment, not its most recent, so the result does not
      // depend on the order a group happened to grow in.
      const smaller = Math.min(vocabulary.size, group.vocabulary.size);
      const larger = Math.max(vocabulary.size, group.vocabulary.size);
      const comparable = smaller >= MIN_OVERLAP_TOKENS && larger <= smaller * MAX_VOCABULARY_RATIO;
      const similar = comparable && overlap(vocabulary, group.vocabulary) >= MERGE_OVERLAP_THRESHOLD;
      if (sameTopic || similar) {
        joined = group;
        break;
      }
    }

    if (joined) {
      joined.ranges.push({ start: segment.start, end: segment.end });
      joined.texts.push(segment.text);
      joined.polarities.add(polarity);
    } else {
      const index = groups.length;
      groups.push({
        kind,
        topic,
        vocabulary,
        polarities: new Set([polarity]),
        ranges: [{ start: segment.start, end: segment.end }],
        texts: [segment.text]
      });
      // Indexed by the first fragment's vocabulary and topic, which is what a later segment is
      // compared against.
      if (topic !== null) push(byTopic, `${kind}\u0000${topic}`, index);
      for (const word of vocabulary) push(byToken, word, index);
    }
  }

  return finish(groups);
}

/**
 * Sort ranges within each blok, sort bloks by their first range, derive ids from content.
 *
 * Ranges are **never coalesced**, even when two of them are exactly adjacent. Decision 6 says a
 * range must never cover text the blok does not own, and never coalescing is that rule with no edge
 * cases to get wrong later.
 */
function finish(groups: readonly Group[]): Blok[] {
  const bloks = groups.map((group) => {
    const fragments = group.ranges.map((range, index) => ({ range, text: group.texts[index]! }));
    fragments.sort((left, right) => left.range.start - right.range.start);

    // The id covers the kind and every range's offsets and exact text. Including the offsets makes
    // ids unique within a prompt by construction — two bloks cannot share a first range — so there
    // is no counter and no collision tie-break to make non-deterministic.
    const parts: string[] = [group.kind];
    for (const { range, text } of fragments) parts.push(`${range.start}:${range.end}:${text}`);

    return {
      id: `blok_${hash(parts.join(" "))}`,
      kind: group.kind,
      ranges: fragments.map(({ range }) => range)
    };
  });

  bloks.sort((left, right) => left.ranges[0]!.start - right.ranges[0]!.start);
  return bloks;
}

/** Every committed pattern in this module, for the pattern-safety test. */
export function clusterPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return [
    ...topicsData.map((row) => ({ id: `topic:${row.key}`, pattern: row.pattern, flags: row.flags })),
    ...polarityData.negative.map((row) => ({ id: `negative:${row.id}`, pattern: row.pattern, flags: row.flags })),
    ...polarityData.positive.map((row) => ({ id: `positive:${row.id}`, pattern: row.pattern, flags: row.flags }))
  ];
}
