// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Structural safety checks for a regular expression written as *data*.
//
// EPIC-010 kept every pattern in the segmenter as a literal and enumerated them in a test, which
// worked because there were three. From EPIC-011a on, the patterns that decide a kind, a topic and
// a polarity live in committed JSON, where a source-scanning test cannot see them — so the check
// moves here, where both the segmenter's literals and the data files' strings can go through it.
//
// Zero imports on purpose: this file is pure string analysis, so it stays inside `core-is-pure`
// and can be called from production code as well as from tests.

/** One thing wrong with a pattern, named well enough to fix without a debugger. */
export interface PatternDefect {
  readonly pattern: string;
  readonly rule: string;
  readonly detail: string;
}

/**
 * Occurrences of the `(X+)+` shape: a group that is itself quantified and whose body already
 * contains a quantifier.
 *
 * That structure is behind every catastrophic-backtracking incident, and it is detectable without
 * running anything — which matters, because a timing test only catches backtracking when it
 * happens to be handed the input that triggers it, and the next person adding a pattern will not
 * think of that input.
 */
export function findNestedQuantifiers(pattern: string): string[] {
  const found: string[] = [];
  const groups =
    pattern.match(/\((?:\?[:=!<]{1,2})?(?:\\.|[^()\\])*\)[*+?]|\((?:\?[:=!<]{1,2})?(?:\\.|[^()\\])*\)\{/g) ?? [];
  for (const group of groups) {
    const body = group.slice(group.indexOf("(") + 1, group.lastIndexOf(")"));
    if (/[*+]|\{\d+,/.test(body.replace(/\\./g, ""))) found.push(group);
  }
  return found;
}

/**
 * Everything that has to be true of a committed pattern: it compiles, and it has no nested
 * quantifier. Returns an empty array when the pattern is fit to ship.
 */
export function checkPattern(pattern: string, flags = ""): PatternDefect[] {
  const defects: PatternDefect[] = [];

  try {
    new RegExp(pattern, flags);
  } catch (error) {
    defects.push({
      pattern,
      rule: "compiles",
      detail: error instanceof Error ? error.message : "does not compile"
    });
    // A pattern that does not compile cannot be analysed further, and the shape check below would
    // only add noise to a failure that already says exactly what is wrong.
    return defects;
  }

  for (const nested of findNestedQuantifiers(pattern)) {
    defects.push({
      pattern,
      rule: "no-nested-quantifier",
      detail: `${nested} quantifies a group whose body is already quantified`
    });
  }

  return defects;
}
