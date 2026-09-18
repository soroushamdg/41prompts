// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { Segment } from "./types.js";

/** One broken promise, with enough context to find it without a debugger. */
export interface InvariantViolation {
  /** Short name of the invariant, matching the list in `README.md`. */
  readonly rule: string;
  readonly detail: string;
}

// The ECMAScript whitespace set, spelled the same way `String.prototype.trim` spells it — which
// includes U+FEFF, so a byte-order mark counts as whitespace and lands in a gap. Deliberately
// written as a plain single-character test rather than reusing the segmenter's own fast-path
// predicate: this file has to be able to disagree with the implementation, or it proves nothing.
const WHITESPACE = /\s/;

function isWhitespace(source: string, index: number): boolean {
  return WHITESPACE.test(source.charAt(index));
}

function describe(text: string): string {
  const shown = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return JSON.stringify(shown);
}

/**
 * Re-derive every promise `segment()` makes, from the input and the output alone.
 *
 * This is the executable form of the contract in `README.md`, and the thing the property test
 * asserts on every fixture and every generated input. It is exported because the promises hold
 * for anything that produces `Segment`s, not just this segmenter: later epics that slice, merge
 * or re-anchor ranges can check themselves with it.
 *
 * Returns an empty array when everything holds.
 */
export function checkSegmentInvariants(source: string, segments: readonly Segment[]): InvariantViolation[] {
  const violations: InvariantViolation[] = [];
  let cursor = 0;
  let rebuilt = "";

  for (let i = 0; i < segments.length; i++) {
    const { text, start, end } = segments[i]!;
    const at = `segment ${i} [${start}, ${end})`;

    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      violations.push({ rule: "integer-offsets", detail: `${at}: offsets must be integers` });
      continue;
    }
    if (start < 0 || end > source.length) {
      violations.push({ rule: "in-bounds", detail: `${at}: outside [0, ${source.length}]` });
      continue;
    }
    if (end <= start) {
      violations.push({ rule: "non-empty", detail: `${at}: empty or inverted range` });
      continue;
    }
    if (start < cursor) {
      violations.push({ rule: "ordered-and-disjoint", detail: `${at}: overlaps or precedes ${cursor}` });
      continue;
    }
    if (text !== source.slice(start, end)) {
      violations.push({
        rule: "verbatim",
        detail: `${at}: text ${describe(text)} is not the source slice ${describe(source.slice(start, end))}`
      });
    }
    if (isWhitespace(source, start) || isWhitespace(source, end - 1)) {
      violations.push({ rule: "edge-trimmed", detail: `${at}: starts or ends on whitespace` });
    }

    const gap = source.slice(cursor, start);
    for (let g = 0; g < gap.length; g++) {
      if (!WHITESPACE.test(gap.charAt(g))) {
        violations.push({
          rule: "gaps-are-whitespace",
          detail: `dropped ${describe(gap.charAt(g))} at ${cursor + g}, before ${at}`
        });
        break;
      }
    }

    rebuilt += gap + text;
    cursor = end;
  }

  const tail = source.slice(cursor);
  for (let t = 0; t < tail.length; t++) {
    if (!WHITESPACE.test(tail.charAt(t))) {
      violations.push({
        rule: "gaps-are-whitespace",
        detail: `dropped ${describe(tail.charAt(t))} at ${cursor + t}, after the last segment`
      });
      break;
    }
  }
  rebuilt += tail;

  if (rebuilt !== source) {
    violations.push({
      rule: "reconstruction",
      detail: `segments plus gaps rebuild ${rebuilt.length} code units, not ${source.length}`
    });
  }

  return violations;
}
