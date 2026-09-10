// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { classify } from "../classify/classify.js";
import type { BlokKind } from "../classify/types.js";
import type { Range, Segment } from "../segment/types.js";
import { contradicts, polarityOf, polarityPatterns, type Polarity } from "./polarity.js";
import {
  MAX_VOCABULARY_RATIO,
  MERGE_OVERLAP_THRESHOLD,
  MIN_OVERLAP_TOKENS,
  normalise,
  overlap
} from "./similarity.js";
import { topicOf, topicPatterns } from "./topics.js";
import type { Blok } from "./types.js";

// The merge thresholds live in `similarity.ts` and the topic keys in `topics.ts`, both imported
// above rather than defined here. Neither is configurable at run time on purpose: a threshold that
// varies per caller is a threshold no snapshot can pin down.
//
// `topicOf` moved out in EPIC-012b so `rule_without_check` can ask the same question about a rule
// and a check. Same file, same order, same precedence — merge behaviour and every clustering
// snapshot are unchanged.

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
      id: `blok_${hash(parts.join("\u0000"))}`,
      kind: group.kind,
      ranges: fragments.map(({ range }) => range)
    };
  });

  bloks.sort((left, right) => left.ranges[0]!.start - right.ranges[0]!.start);
  return bloks;
}

export { MERGE_OVERLAP_THRESHOLD };

/** Every committed pattern in this module, for the pattern-safety test. */
export function clusterPatterns(): ReadonlyArray<{ id: string; pattern: string; flags: string }> {
  return [...topicPatterns(), ...polarityPatterns()];
}
