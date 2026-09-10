// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// ── Rules 5 and 6: list items, then long paragraphs ──────────────────────────────────────────
//
// Both rules cut inside a paragraph, and only one of them ever runs: a list is a list even when
// its items are long, because splitting rule 4 of a numbered list into two half-rules would
// attribute a later failure to half a rule.

import { LIST_MIN_ITEMS, SENTENCE_SPLIT_THRESHOLD } from "./constants.js";
import { indentWidth, isDigit, isWhitespaceAt, skipIndent } from "./chars.js";
import type { Line } from "./lines.js";
import { sentenceRanges } from "./sentences.js";
import type { Range } from "./types.js";

const HYPHEN = 0x2d;
const ASTERISK = 0x2a;
const PLUS = 0x2b;
const BULLET = 0x2022; // •
const FULL_STOP = 0x2e;
const CLOSING_PAREN = 0x29;
// CommonMark's limit, and past it a "marker" is far more likely to be a year, an amount or an
// identifier than a list.
const MAX_ORDERED_DIGITS = 9;

interface ListMarker {
  /** Indentation in columns, for deciding what is nested under what. */
  readonly width: number;
}

/**
 * A list marker at the start of a line: `-`, `*`, `+`, `•`, `1.` or `1)`, followed by whitespace
 * or end of line. The bullet set and the `1.`/`1)` pair both come from the prototype.
 */
function listMarkerAt(text: string, line: Line): ListMarker | null {
  const width = indentWidth(text, line.start, line.contentEnd);
  let i = skipIndent(text, line.start, line.contentEnd);
  if (i >= line.contentEnd) return null;

  const code = text.charCodeAt(i);
  if (code === HYPHEN || code === ASTERISK || code === PLUS || code === BULLET) {
    i += 1;
  } else if (isDigit(code)) {
    let digits = 0;
    while (i < line.contentEnd && isDigit(text.charCodeAt(i)) && digits < MAX_ORDERED_DIGITS) {
      digits += 1;
      i += 1;
    }
    // Guard before reading the delimiter: `contentEnd` is the index of the line terminator, so
    // reading past it would be reading the newline — harmless today, and exactly the kind of
    // off-by-one that becomes a real bug the moment someone changes what follows a line.
    if (i >= line.contentEnd) return null;
    const delimiter = text.charCodeAt(i);
    if (delimiter !== FULL_STOP && delimiter !== CLOSING_PAREN) return null;
    i += 1;
  } else {
    return null;
  }

  if (i < line.contentEnd && !isWhitespaceAt(text, i)) return null;
  return { width };
}

/**
 * Split a paragraph into one range per list item.
 *
 * A new item starts at a marker no deeper than the first one. Anything else — a continuation
 * line, a nested list, a second sentence of the same item — stays with the item above it, which
 * is what "a nested list stays with its parent item" means: the sub-bullets under rule 3 *are*
 * rule 3, and a blok that owned them separately could not be edited as one rule.
 *
 * Lines before the first marker ("Rules:", "Follow these steps:") become one lead-in range.
 */
function splitListItems(text: string, lines: readonly Line[], startLine: number, endLine: number): Range[] | null {
  const markers: number[] = [];
  let baseWidth = -1;

  for (let li = startLine; li <= endLine; li++) {
    const marker = listMarkerAt(text, lines[li]!);
    if (marker === null) continue;
    if (baseWidth < 0) baseWidth = marker.width;
    if (marker.width <= baseWidth) markers.push(li);
  }

  if (markers.length < LIST_MIN_ITEMS) return null;

  const ranges: Range[] = [];
  const firstItem = markers[0]!;
  if (firstItem > startLine) {
    ranges.push({ start: lines[startLine]!.start, end: lines[firstItem - 1]!.contentEnd });
  }

  for (let m = 0; m < markers.length; m++) {
    const from = markers[m]!;
    const to = m + 1 < markers.length ? markers[m + 1]! - 1 : endLine;
    ranges.push({ start: lines[from]!.start, end: lines[to]!.contentEnd });
  }

  return ranges;
}

/** Length of `[start, end)` ignoring whitespace at either edge — the prototype's `trim().length`. */
function trimmedLength(text: string, start: number, end: number): number {
  let s = start;
  let e = end;
  while (s < e && isWhitespaceAt(text, s)) s += 1;
  while (e > s && isWhitespaceAt(text, e - 1)) e -= 1;
  return e - s;
}

/** Apply rules 5 and 6 to one paragraph unit, in that order. */
export function splitParagraph(text: string, lines: readonly Line[], startLine: number, endLine: number): Range[] {
  const listRanges = splitListItems(text, lines, startLine, endLine);
  if (listRanges !== null) return listRanges;

  const start = lines[startLine]!.start;
  const end = lines[endLine]!.contentEnd;

  if (trimmedLength(text, start, end) > SENTENCE_SPLIT_THRESHOLD) {
    // The boundary lives in `sentences.ts` so EPIC-012a's contradiction detector cuts in the same
    // places; a finding highlighting a span the segmenter would never produce would point at text
    // no blok owns.
    return sentenceRanges(text, start, end);
  }

  return [{ start, end }];
}
