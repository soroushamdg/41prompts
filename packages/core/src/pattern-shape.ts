// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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
 * running anything — which matters, because a timing test only catches backtracking when it happens
 * to be handed the input that triggers it, and the next person adding a pattern will not think of
 * that input.
 *
 * ## Why this is a scanner and not a regular expression
 *
 * It used to be one, matching groups with `(?:\\.|[^()\\])*` for the body. That cannot see a group
 * inside a group, so `((a|b)+)+` passed — and neither can it survive a `)` inside a character
 * class, so `([a-z)]+)+` passed too. Both are textbook catastrophic shapes, and both went through a
 * gate whose entire job was to stop them. Found in self-review.
 *
 * A scanner tracks what a regular expression cannot: nesting depth, escapes, and whether it is
 * inside a character class where `(` and `)` are ordinary characters.
 *
 * `?` and a bounded `{n,m}` are not treated as dangerous quantifiers on a group: `(a+)?` and
 * `(a+){2,3}` are bounded and cannot blow up. `*`, `+` and an open-ended `{n,}` can.
 */
export function findNestedQuantifiers(pattern: string): string[] {
  const found: string[] = [];

  /** Start index of each open group, innermost last. */
  const groupStart: number[] = [];
  /** Whether each open group's body has seen a quantifier, at any depth inside it. */
  const groupHasQuantifier: boolean[] = [];
  /** Whether the top level has seen a quantifier — unused, but keeps the arrays aligned. */
  let inClass = false;

  const noteQuantifier = (): void => {
    if (groupHasQuantifier.length > 0) groupHasQuantifier[groupHasQuantifier.length - 1] = true;
  };

  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!;

    if (char === "\\") {
      i += 1; // the escaped character is data, whatever it is
      continue;
    }

    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }

    if (char === "[") {
      inClass = true;
      continue;
    }

    if (char === "(") {
      groupStart.push(i);
      groupHasQuantifier.push(false);
      continue;
    }

    if (char === ")") {
      const start = groupStart.pop();
      const bodyWasQuantified = groupHasQuantifier.pop() ?? false;
      if (start === undefined) continue; // unbalanced; `checkPattern` reports it as not compiling

      const quantifier = quantifierAt(pattern, i + 1);
      if (quantifier !== null) {
        if (bodyWasQuantified && quantifier.unbounded) {
          found.push(pattern.slice(start, i + 1 + quantifier.length));
        }
        // A quantified group is itself a quantifier as far as any enclosing group is concerned:
        // `((a+)+)+` must report the outer pair too.
        noteQuantifier();
        i += quantifier.length;
        continue;
      }
      // An unquantified group still propagates what its body found, so `((a+))+` is caught.
      if (bodyWasQuantified) noteQuantifier();
      continue;
    }

    if (char === "*" || char === "+" || char === "{") {
      const quantifier = quantifierAt(pattern, i);
      if (quantifier !== null) {
        noteQuantifier();
        i += quantifier.length - 1;
      }
      continue;
    }
  }

  return found;
}

/**
 * The quantifier starting at `index`, if there is one.
 *
 * `unbounded` marks the ones that can blow up when applied to an already-quantified group: `*`, `+`
 * and `{n,}`. `?` and `{n,m}` are bounded.
 */
function quantifierAt(pattern: string, index: number): { length: number; unbounded: boolean } | null {
  const char = pattern[index];
  if (char === "*" || char === "+") {
    const lazy = pattern[index + 1] === "?";
    return { length: lazy ? 2 : 1, unbounded: true };
  }
  if (char === "?") {
    const lazy = pattern[index + 1] === "?";
    return { length: lazy ? 2 : 1, unbounded: false };
  }
  if (char !== "{") return null;

  let i = index + 1;
  let digits = 0;
  while (i < pattern.length && pattern[i]! >= "0" && pattern[i]! <= "9") {
    digits += 1;
    i += 1;
  }
  if (digits === 0) return null; // a literal `{`

  let unbounded = false;
  if (pattern[i] === ",") {
    i += 1;
    let upper = 0;
    while (i < pattern.length && pattern[i]! >= "0" && pattern[i]! <= "9") {
      upper += 1;
      i += 1;
    }
    unbounded = upper === 0; // `{2,}` is open-ended; `{2,3}` is not
  }
  if (pattern[i] !== "}") return null; // a literal `{`

  const lazy = pattern[i + 1] === "?";
  return { length: i + 1 - index + (lazy ? 1 : 0), unbounded };
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
