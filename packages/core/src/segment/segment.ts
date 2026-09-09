// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { isWhitespaceAt } from "./chars.js";
import { buildUnits } from "./units.js";
import { scanFences } from "./fences.js";
import { scanLines } from "./lines.js";
import { splitParagraph } from "./paragraphs.js";
import { scanTagRegions } from "./tags.js";
import type { Segment } from "./types.js";

/**
 * Cut a prompt into segments with exact source offsets.
 *
 * ## The rule order (see `README.md` for why it is this order)
 *
 * 1. Fenced code blocks (``` and ~~~) are atomic.
 * 2. XML/HTML-style tag blocks whose open and close tags match are atomic.
 * 3. Markdown headings are separators; the heading line is its own segment.
 * 4. Blank lines separate paragraphs.
 * 5. List items are one segment each; a nested list stays with its parent item.
 * 6. A paragraph longer than `SENTENCE_SPLIT_THRESHOLD` is split at sentence boundaries.
 *
 * ## What it promises
 *
 * - `text` is the **verbatim** source slice: `text === source.slice(start, end)`, always.
 * - Offsets are UTF-16 code units, `start` inclusive, `end` exclusive. See `types.ts` — a
 *   consumer indexing by code point, as Python does, must convert.
 * - Segments are ordered, non-overlapping, non-empty, and trimmed of whitespace at both edges.
 * - **Nothing is dropped.** Every non-whitespace code unit of the input belongs to exactly one
 *   segment; the gaps between segments are whitespace and nothing else. Concatenating the
 *   segments and the gaps reproduces the input exactly.
 * - Same input, same output — on every run, on every machine, forever. No clock, no randomness,
 *   no locale-sensitive comparison, no iteration over object keys.
 *
 * `checkSegmentInvariants()` in `invariants.ts` is the executable form of all of that.
 */
export function segment(text: string): Segment[] {
  const segments: Segment[] = [];
  if (text.length === 0) return segments;

  const lines = scanLines(text);
  const fences = scanFences(text, lines);
  const tags = scanTagRegions(text, lines, fences);

  for (const unit of buildUnits(text, lines, fences, tags)) {
    if (unit.kind === "paragraph") {
      for (const range of splitParagraph(text, lines, unit.startLine, unit.endLine)) {
        pushTrimmed(text, range.start, range.end, segments);
      }
    } else {
      // Atomic and heading units are emitted whole: rules 5 and 6 never reach inside them.
      pushTrimmed(text, lines[unit.startLine]!.start, lines[unit.endLine]!.contentEnd, segments);
    }
  }

  return segments;
}

/**
 * Trim by moving indices, never by trimming a string and searching for it again.
 *
 * The prototype did the latter (`text.indexOf(str, cursor)`), which quietly gives the wrong
 * offset — or none at all — when the same sentence appears twice in one prompt. Whitespace that
 * gets trimmed off here becomes a gap, which is why trimming does not violate "nothing is
 * dropped": the gap still holds it, byte for byte.
 */
function pushTrimmed(text: string, start: number, end: number, out: Segment[]): void {
  let s = start;
  let e = end;
  while (s < e && isWhitespaceAt(text, s)) s += 1;
  while (e > s && isWhitespaceAt(text, e - 1)) e -= 1;
  if (s < e) out.push({ text: text.slice(s, e), start: s, end: e });
}
