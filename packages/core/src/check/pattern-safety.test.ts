// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { grade } from "./grade.js";
import { isPatternSafe, MAX_PATTERN_LENGTH, rejectUnsafePattern } from "./pattern-safety.js";
import type { Check } from "../compile/types.js";

describe("the filter refuses the shapes that backtrack exponentially", () => {
  it.each([
    ["(a+)+", "a quantified group whose body is quantified"],
    ["(a*)*", "the star form"],
    ["(a+)*", "mixed"],
    ["((a|b)+)+", "a group inside a group — the case a regex-based check missed"],
    ["([a-z)]+)+", "a `)` inside a character class — the other case it missed"],
    ["(\\d+)+$", "the classic, anchored"]
  ])("rejects %s (%s)", (pattern) => {
    expect(isPatternSafe(pattern)).toBe(false);
    expect(rejectUnsafePattern(pattern).some((r) => r.rule === "nested_quantifier")).toBe(true);
  });

  it.each(["\\b[A-Z]{2}-\\d{4}\\b", "^yes|no$", "[a-z]+@[a-z]+\\.[a-z]{2,}", "(?:ab)+", "(a+)?", "(a+){2,3}"])(
    "allows %s",
    (pattern) => {
      expect(isPatternSafe(pattern), `${pattern} should be allowed`).toBe(true);
    }
  );
});

describe("the other three refusals", () => {
  it("refuses a backreference, and is not fooled by an escaped backslash", () => {
    expect(rejectUnsafePattern("(a)\\1").some((r) => r.rule === "backreference")).toBe(true);
    // `\\1` is a literal backslash then a one — not a backreference, and must not be read as one.
    expect(rejectUnsafePattern("a\\\\1").some((r) => r.rule === "backreference")).toBe(false);
    // `\0` is the NUL escape, not a backreference.
    expect(rejectUnsafePattern("a\\0").some((r) => r.rule === "backreference")).toBe(false);
  });

  it("refuses lookbehind", () => {
    expect(rejectUnsafePattern("(?<=a)b").some((r) => r.rule === "lookbehind")).toBe(true);
    expect(rejectUnsafePattern("(?<!a)b").some((r) => r.rule === "lookbehind")).toBe(true);
    // Lookahead is fine and stays fine.
    expect(isPatternSafe("(?=a)ab")).toBe(true);
  });

  it("refuses a pattern longer than the bound", () => {
    const long = `${"a".repeat(MAX_PATTERN_LENGTH + 1)}`;
    expect(rejectUnsafePattern(long).some((r) => r.rule === "too_long")).toBe(true);
  });

  it("refuses one that will not compile", () => {
    expect(rejectUnsafePattern("(unclosed").some((r) => r.rule === "will_not_compile")).toBe(true);
  });

  it("reports every reason, not just the first, so fixing one does not reveal the next", () => {
    const rejections = rejectUnsafePattern("(?<=x)(a+)+\\1");
    expect(rejections.map((r) => r.rule).sort()).toEqual(["backreference", "lookbehind", "nested_quantifier"]);
  });
});

/**
 * **The criterion, and the reason the whole filter exists.**
 *
 * `(a+)+$` against thirty `a`s and a `b` is the textbook catastrophic case: a naive implementation
 * does not return a wrong answer, it does not return. This asserts the *product* behaviour — that
 * grading such a check completes, promptly, with `not_graded` — rather than asserting anything about
 * the regex engine.
 *
 * Timed rather than merely awaited: a test that only checked the outcome would pass if the answer
 * arrived after four minutes, which is not the property being claimed.
 */
describe("a catastrophic pattern never reaches the engine", () => {
  it("grades in bounded time, and does not fail the prompt", () => {
    const evil: Check = {
      id: "chk_evil",
      blokId: "blok_evil",
      text: 'The reply must match "(a+)+$".',
      kind: "matches_pattern"
    };
    const bait = `${"a".repeat(30)}b`;

    const started = Date.now();
    const result = grade(evil, bait);
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(250);
    expect(result.outcome).toBe("not_graded");
    expect(result.reason).toBe("pattern_rejected");
    // Our limitation, not the author's error: it must not fail their prompt.
    expect(result.outcome).not.toBe("fail");
  });
});

/**
 * Said in the code, said here.
 *
 * These are safe patterns that the filter refuses anyway. The test exists so the over-strictness is
 * a documented property rather than a surprise, and so nobody later reads the filter as a proof and
 * "fixes" a false rejection by weakening the scan.
 */
describe("known false rejections, listed rather than discovered", () => {
  it.each([
    ["(?:ab+)*", "harmless over short inputs, refused because the shape cannot be told apart"],
    ["(\\d+)+", "same shape, ordinary intent"],
    ["(a)\\1", "a backreference that would be cheap here"],
    ["(?<=\\$)\\d+", "lookbehind, well-behaved in V8"]
  ])("refuses %s — %s", (pattern) => {
    expect(isPatternSafe(pattern)).toBe(false);
  });
});
