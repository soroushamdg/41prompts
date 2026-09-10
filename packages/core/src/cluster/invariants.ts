// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { BLOK_KINDS } from "../classify/types.js";
import type { InvariantViolation } from "../segment/invariants.js";
import type { Segment } from "../segment/types.js";
import type { Blok } from "./types.js";

/**
 * Re-derive every promise `cluster()` makes, from the segments and the bloks alone.
 *
 * The clustering analogue of `checkSegmentInvariants()`, and exported for the same reason: any later
 * epic that splits, joins or re-anchors bloks — EPIC-020's compiler, EPIC-021b's canvas — can check
 * itself against the same list rather than inventing its own idea of a well-formed blok.
 *
 * Returns an empty array when everything holds.
 */
export function checkBlokInvariants(segments: readonly Segment[], bloks: readonly Blok[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  const ids = new Set<string>();
  const claimed = new Map<string, string>();

  let previousStart = -1;
  for (const blok of bloks) {
    const at = `blok ${blok.id}`;

    if (!/^blok_[0-9a-f]{8}$/.test(blok.id)) {
      violations.push({ rule: "id-shape", detail: `${at}: not blok_ plus eight hex digits` });
    }
    if (ids.has(blok.id)) {
      violations.push({ rule: "unique-ids", detail: `${at}: appears twice` });
    }
    ids.add(blok.id);

    if (!BLOK_KINDS.includes(blok.kind)) {
      violations.push({ rule: "known-kind", detail: `${at}: unknown kind ${blok.kind}` });
    }

    if (!Array.isArray(blok.ranges) || blok.ranges.length === 0) {
      violations.push({ rule: "ranges-are-a-non-empty-array", detail: `${at}: ranges must be an array of one or more` });
      continue;
    }

    let previousEnd = -1;
    for (const range of blok.ranges) {
      const where = `${at} range ${range.start}..${range.end}`;
      if (!Number.isInteger(range.start) || !Number.isInteger(range.end) || range.end <= range.start) {
        violations.push({ rule: "range-is-a-real-span", detail: `${where}: empty, inverted or non-integer` });
        continue;
      }
      if (range.start < previousEnd) {
        violations.push({ rule: "ranges-sorted-and-disjoint", detail: `${where}: overlaps or precedes ${previousEnd}` });
      }
      previousEnd = range.end;

      const key = `${range.start}:${range.end}`;
      const owner = claimed.get(key);
      if (owner !== undefined) {
        violations.push({ rule: "one-owner-per-range", detail: `${where}: already owned by ${owner}` });
      }
      claimed.set(key, blok.id);
    }

    const firstStart = blok.ranges[0]!.start;
    if (firstStart < previousStart) {
      violations.push({ rule: "bloks-ordered-by-first-range", detail: `${at}: starts at ${firstStart}, after ${previousStart}` });
    }
    previousStart = firstStart;
  }

  // Nothing is dropped, and nothing is invented: the set of ranges the bloks own is exactly the set
  // of segments that went in. This is the clustering half of EPIC-010's "gaps are whitespace only" —
  // the promise that clustering regroups text without losing or fabricating any of it.
  const incoming = new Set(segments.map((segment) => `${segment.start}:${segment.end}`));
  for (const key of claimed.keys()) {
    if (!incoming.has(key)) {
      violations.push({ rule: "ranges-come-from-segments", detail: `range ${key} was not a segment` });
    }
  }
  for (const key of incoming) {
    if (!claimed.has(key)) {
      violations.push({ rule: "every-segment-lands-in-a-blok", detail: `segment ${key} is in no blok` });
    }
  }

  return violations;
}
