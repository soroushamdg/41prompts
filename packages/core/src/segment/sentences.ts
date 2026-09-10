// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { isSentenceTerminator, isWhitespaceAt } from "./chars.js";
import type { Range } from "./types.js";

/**
 * Split `[start, end)` after every `.`, `!` or `?` that is immediately followed by whitespace.
 *
 * The segmenter's rule 6 boundary, extracted so the contradiction detector cuts in the same places.
 * That detector has to work on sentences — the only real contradiction in the decompiler
 * prototype's own sample sits between two adjacent sentences of a single paragraph, which is one
 * segment and therefore one range — and a finding that highlighted a span the segmenter would never
 * have produced would point at text no blok owns.
 *
 * Deliberately does not treat a closing quote as part of the sentence before it, and does not
 * special-case abbreviations. `segment/README.md` explains both at length; the short version is
 * that declining to guess costs a blok one sentence too long, while guessing wrongly costs a
 * highlight that points at nonsense.
 */
export function sentenceRanges(text: string, start: number, end: number): Range[] {
  const ranges: Range[] = [];
  let cut = start;
  let i = start;

  while (i < end) {
    if (!isSentenceTerminator(text.charCodeAt(i))) {
      i += 1;
      continue;
    }

    const after = i + 1;
    if (after < end && isWhitespaceAt(text, after)) {
      ranges.push({ start: cut, end: after });
      cut = after;
    }
    i = after;
  }

  if (cut < end) ranges.push({ start: cut, end });
  return ranges;
}

/** `sentenceRanges`, with whitespace trimmed off each end and empty spans dropped. */
export function trimmedSentenceRanges(text: string, start: number, end: number): Range[] {
  const out: Range[] = [];
  for (const range of sentenceRanges(text, start, end)) {
    let from = range.start;
    let to = range.end;
    while (from < to && isWhitespaceAt(text, from)) from += 1;
    while (to > from && isWhitespaceAt(text, to - 1)) to -= 1;
    if (from < to) out.push({ start: from, end: to });
  }
  return out;
}
