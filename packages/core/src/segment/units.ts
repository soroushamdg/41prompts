// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

// ── Rules 3 and 4: headings separate, blank lines separate ───────────────────────────────────
//
// This pass turns a list of lines into a list of units — the largest run of lines that any one
// rule claims. It is where the rule *order* is actually enforced, top down, one line at a time:
// a fence claims its lines before a tag can, a tag before a heading, a heading before a blank
// line, and whatever is left accumulates into a paragraph for rules 5 and 6 to finish.

import { indentWidth, isBlankRange, isWhitespaceAt, skipIndent } from "./chars.js";
import type { FenceMap } from "./fences.js";
import type { Line } from "./lines.js";
import type { TagMap } from "./tags.js";

/**
 * `atomic` — a fenced or tag block, never split further, whatever is inside it.
 * `heading` — one heading line, its own segment.
 * `paragraph` — a run of lines with no blank line in it, still to be split by rules 5 and 6.
 */
export type UnitKind = "atomic" | "heading" | "paragraph";

export interface Unit {
  readonly kind: UnitKind;
  /** First line index, inclusive. */
  readonly startLine: number;
  /** Last line index, inclusive. */
  readonly endLine: number;
}

const HASH = 0x23;

/**
 * An ATX heading: up to three columns of indentation, one to six `#`, then whitespace or end
 * of line.
 *
 * Setext headings (`===` or `---` underneath a line) are deliberately not recognised. `---` is
 * also a thematic break and, in a prompt, most often a divider the author drew by hand; a rule
 * that has to guess between the two is a rule whose output depends on the guess. See README.
 */
function isHeadingLine(text: string, line: Line): boolean {
  if (indentWidth(text, line.start, line.contentEnd) > 3) return false;
  let i = skipIndent(text, line.start, line.contentEnd);

  let hashes = 0;
  while (i < line.contentEnd && text.charCodeAt(i) === HASH) {
    hashes += 1;
    if (hashes > 6) return false;
    i += 1;
  }
  if (hashes === 0) return false;

  return i >= line.contentEnd || isWhitespaceAt(text, i);
}

/** Group lines into units, applying rules 1–4 in order. */
export function buildUnits(text: string, lines: readonly Line[], fences: FenceMap, tags: TagMap): Unit[] {
  const units: Unit[] = [];
  let paragraphStart = -1;

  const endParagraph = (endLine: number): void => {
    if (paragraphStart >= 0) {
      units.push({ kind: "paragraph", startLine: paragraphStart, endLine });
      paragraphStart = -1;
    }
  };

  let i = 0;
  while (i < lines.length) {
    const fenceEnd = fences.opensAt[i]!;
    if (fenceEnd >= 0) {
      endParagraph(i - 1);
      units.push({ kind: "atomic", startLine: i, endLine: fenceEnd });
      i = fenceEnd + 1;
      continue;
    }

    const tagEnd = tags.opensAt[i]!;
    if (tagEnd >= 0) {
      endParagraph(i - 1);
      units.push({ kind: "atomic", startLine: i, endLine: tagEnd });
      i = tagEnd + 1;
      continue;
    }

    const line = lines[i]!;
    if (isBlankRange(text, line.start, line.contentEnd)) {
      endParagraph(i - 1);
      i += 1;
      continue;
    }

    if (isHeadingLine(text, line)) {
      endParagraph(i - 1);
      units.push({ kind: "heading", startLine: i, endLine: i });
      i += 1;
      continue;
    }

    if (paragraphStart < 0) paragraphStart = i;
    i += 1;
  }

  endParagraph(lines.length - 1);
  return units;
}
