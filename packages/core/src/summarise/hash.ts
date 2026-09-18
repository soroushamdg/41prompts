// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Blok } from "../cluster/types.js";

/**
 * The cache key for a summary: a hash of everything the summariser read.
 *
 * ## What is in it, and why
 *
 * - **Every range's text**, length-prefixed and delimited, so two different fragment splits of the
 *   same characters can never collide into one key.
 * - **The blok's kind.** Decision 5 describes the hash as covering "the blok's verbatim text plus
 *   the summariser's own version identifier", and decision 3 has the heuristic prefix the kind —
 *   and those two cannot both be taken literally. If the summary depends on the kind and the key
 *   does not, a blok reclassified from `context` to `constraint` keeps its old summary for ever,
 *   which is the one failure a content-addressed cache exists to prevent. A cache key covers every
 *   input the function reads, or it is not a cache key.
 * - **The summariser's version**, which is what makes a reworded prompt or a changed truncation
 *   invalidate everything it produced, with no invalidation logic for anyone to remember.
 *
 * ## What is deliberately left out
 *
 * - **The ranges' offsets**, and **the surrounding prompt**. Moving a rule to a different place in a
 *   prompt does not change what the rule says, so it must not throw away its summary — and on a
 *   canvas where reordering is an ordinary edit, that is the difference between a cache that helps
 *   and one that misses constantly. A decision, not an omission.
 */
export function summaryInputHash(blok: Blok, source: string, version: string): string {
  const parts: string[] = [version, blok.kind];
  for (const range of blok.ranges) {
    const text = source.slice(range.start, range.end);
    // Length-prefixed: ["ab", "c"] and ["a", "bc"] must not hash alike.
    parts.push(`${text.length}:${text}`);
  }
  return hash(parts.join(" "));
}

/**
 * Sixteen hex digits of FNV-1a, run twice from different bases and concatenated — the same
 * construction `cluster.ts` uses for blok ids, and for the same reason: thirty-two bits is a
 * birthday collision waiting to happen once there are thousands of keys, and a colliding cache key
 * hands back somebody else's summary.
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
