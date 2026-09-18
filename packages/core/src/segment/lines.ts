// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/** One source line, in UTF-16 code unit indices. */
export interface Line {
  /** Index of the first code unit of the line. */
  readonly start: number;
  /** Index just past the last code unit before the line terminator. */
  readonly contentEnd: number;
  /** Index just past the terminator — the next line's `start`. */
  readonly end: number;
}

/**
 * Cut the source into lines in one pass, keeping the terminator out of `contentEnd` and inside
 * `end` so no caller ever has to guess whether a range includes its newline.
 *
 * All three terminators are recognised: `\n`, `\r\n`, and a lone `\r`. The prototype split on
 * `/\n{2,}/`, which cannot see a CRLF paragraph break at all (`\r\n\r\n` contains no `\n\n`) and
 * so treats a whole CRLF file as one paragraph. A prompt pasted from a Windows editor is not a
 * different prompt.
 *
 * A final line without a terminator is included. A trailing terminator does not produce a
 * phantom empty line after it.
 */
export function scanLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  let i = 0;

  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code === 0x0a) {
      lines.push({ start, contentEnd: i, end: i + 1 });
      i += 1;
      start = i;
    } else if (code === 0x0d) {
      const end = text.charCodeAt(i + 1) === 0x0a ? i + 2 : i + 1;
      lines.push({ start, contentEnd: i, end });
      i = end;
      start = i;
    } else {
      i += 1;
    }
  }

  if (start < text.length) {
    lines.push({ start, contentEnd: text.length, end: text.length });
  }

  return lines;
}
