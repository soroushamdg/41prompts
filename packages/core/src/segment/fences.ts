// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// ── Rule 1: fenced code blocks are atomic ────────────────────────────────────────────────────
//
// First rule in the order, and first for a reason: everything below it — headings, blank lines,
// list markers, sentence terminators — is ordinary text inside a fence. A `# heading` line in a
// shell example is not a heading, and a blank line in a JSON sample does not end a paragraph.
// Running this pass first means no later rule has to know that.

import { indentWidth, isBlankRange, skipIndent } from "./chars.js";
import type { Line } from "./lines.js";

const BACKTICK = 0x60;
const TILDE = 0x7e;

interface FenceMarker {
  /** `` ` `` or `~`. A backtick fence is never closed by a tilde fence. */
  readonly code: number;
  /** How many marker characters — a closer must be at least as long as its opener. */
  readonly length: number;
  /** Index just past the marker run. */
  readonly markerEnd: number;
}

/** Per-line fence map. Every later pass reads this instead of re-detecting fences. */
export interface FenceMap {
  /** For each line: the last line index of the fenced block opening here, or -1. */
  readonly opensAt: readonly number[];
  /** For each line: whether it is part of any fenced block, opener and closer included. */
  readonly inside: readonly boolean[];
}

/**
 * A fence marker at the start of a line: up to three columns of indentation, then three or more
 * backticks or tildes. A tab counts as four columns, so a tab-indented line is code, not a fence.
 */
function fenceMarkerAt(text: string, line: Line): FenceMarker | null {
  if (indentWidth(text, line.start, line.contentEnd) > 3) return null;
  const i = skipIndent(text, line.start, line.contentEnd);

  const code = text.charCodeAt(i);
  if (code !== BACKTICK && code !== TILDE) return null;

  let markerEnd = i;
  while (markerEnd < line.contentEnd && text.charCodeAt(markerEnd) === code) markerEnd += 1;

  const length = markerEnd - i;
  return length >= 3 ? { code, length, markerEnd } : null;
}

/** CommonMark: a backtick fence's info string may not contain a backtick. */
function hasBacktick(text: string, start: number, end: number): boolean {
  for (let i = start; i < end; i++) {
    if (text.charCodeAt(i) === BACKTICK) return true;
  }
  return false;
}

/**
 * Map every fenced block in one linear pass. The scan jumps past each block it finds rather than
 * re-scanning from the next line, so a file of nothing but fences is still O(lines).
 *
 * An unterminated fence runs to the end of the input, which is what a reader sees and what the
 * prompt actually contains: dropping the rule at EOF would split a half-written code sample into
 * paragraphs at exactly the moment the user is least likely to want it.
 */
export function scanFences(text: string, lines: readonly Line[]): FenceMap {
  const opensAt: number[] = new Array<number>(lines.length).fill(-1);
  const inside: boolean[] = new Array<boolean>(lines.length).fill(false);

  let i = 0;
  while (i < lines.length) {
    const opener = fenceMarkerAt(text, lines[i]!);
    if (opener === null || (opener.code === BACKTICK && hasBacktick(text, opener.markerEnd, lines[i]!.contentEnd))) {
      i += 1;
      continue;
    }

    let close = lines.length - 1;
    for (let j = i + 1; j < lines.length; j++) {
      const marker = fenceMarkerAt(text, lines[j]!);
      if (
        marker !== null &&
        marker.code === opener.code &&
        marker.length >= opener.length &&
        isBlankRange(text, marker.markerEnd, lines[j]!.contentEnd)
      ) {
        close = j;
        break;
      }
    }

    opensAt[i] = close;
    for (let k = i; k <= close; k++) inside[k] = true;
    i = close + 1;
  }

  return { opensAt, inside };
}
