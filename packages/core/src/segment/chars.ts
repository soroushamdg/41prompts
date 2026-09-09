// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Character predicates shared by every rule. All of them take `(text, index)` rather than a
// character, so no rule ever has to slice a string to ask a question about it — slicing is how a
// segmenter loses track of where it is (epic decision 5).

// The ECMAScript whitespace set, which is what `String.prototype.trim` trims and therefore what
// "trimmed" has to mean here. It includes U+FEFF, so a byte-order mark is whitespace and ends up
// in a gap rather than at the head of the first segment.
const UNICODE_WHITESPACE = /\s/;

/** True when the code unit at `index` is ECMAScript whitespace. Out-of-range indices are false. */
export function isWhitespaceAt(text: string, index: number): boolean {
  const code = text.charCodeAt(index);
  // Fast path for the four ASCII cases that make up essentially all of a real prompt.
  if (code === 0x20 || (code >= 0x09 && code <= 0x0d)) return true;
  if (code < 0x80) return false;
  // NaN (index out of range) falls through to `charAt`, which returns "", which is not whitespace.
  return UNICODE_WHITESPACE.test(text.charAt(index));
}

/** True when every code unit in `[start, end)` is whitespace. An empty range is blank. */
export function isBlankRange(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (!isWhitespaceAt(text, i)) return false;
  }
  return true;
}

export function isSpace(code: number): boolean {
  return code === 0x20;
}

export function isSpaceOrTab(code: number): boolean {
  return code === 0x20 || code === 0x09;
}

export function isDigit(code: number): boolean {
  return code >= 0x30 && code <= 0x39;
}

/** `.`, `!`, `?` — the end of a sentence, per the prototype's boundary definition. */
export function isSentenceTerminator(code: number): boolean {
  return code === 0x2e || code === 0x21 || code === 0x3f;
}


/**
 * Indentation width in columns, counting a tab as advancing to the next multiple of four —
 * the CommonMark tab-stop rule. Used only to compare list nesting depth, never to slice.
 */
export function indentWidth(text: string, start: number, end: number): number {
  let width = 0;
  for (let i = start; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === 0x20) width += 1;
    else if (code === 0x09) width += 4 - (width % 4);
    else break;
  }
  return width;
}

/** Index of the first code unit in `[start, end)` that is not a space or tab. */
export function skipSpacesAndTabs(text: string, start: number, end: number): number {
  let i = start;
  while (i < end && isSpaceOrTab(text.charCodeAt(i))) i++;
  return i;
}
