// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from "vitest";
import { detectPatterns } from "./detect.js";
import { findNestedQuantifiers } from "../pattern-shape.js";

/**
 * **Our own committed detector patterns, held to the shape rule we hold a user's to.**
 *
 * `detect.ts` has carried `detectPatterns()` since EPIC-012a with the comment *"every committed
 * pattern in this module, for the pattern-safety test"*. EPIC-900's dead-code sweep found the
 * helper exported and named by nothing: **the test it was written for was never written.** The
 * helper is the record that somebody wanted this check, so it is answered rather than deleted.
 *
 * The gap it leaves is real rather than theoretical. `check/pattern-safety.ts` exists because
 * `matches_pattern` executes a regular expression a *person* typed, and a catastrophic one does not
 * return a wrong answer — it does not return. These 23 patterns are the other half of that surface:
 * **we** wrote them, and `/decompile` runs every one of them over text anybody can paste. A
 * committed pattern that backtracks exponentially is the same denial of service with our name on
 * it, and nothing was looking.
 *
 * Two assertions, and the second is the one with teeth:
 *
 * 1. every pattern **compiles**. A pattern living in a `.json` file is a string until something
 *    constructs it, so a typo in `untestable.json` is a runtime throw inside `detect()`;
 * 2. no pattern contains a **quantified group whose body is itself quantified** — `(a+)+`, the
 *    shape whose match time is exponential in the input length.
 *
 * **It is `findNestedQuantifiers` and deliberately not `isPatternSafe`.** That filter is
 * over-strict by design: it also refuses backreferences, lookbehind and anything past 400
 * characters, because it cannot ask the author of a check what they meant. We can ask ourselves.
 * Holding our own corpus to the user-facing filter would fail it for reasons that are not about
 * safety and would be deleted the first time it was inconvenient — which is how a gate stops
 * existing. The exponential shape is the property that actually matters, and it is the one asserted.
 */
describe("every committed detector pattern", () => {
  const patterns = detectPatterns();

  it("there are patterns to check at all", () => {
    // The assertion that makes the two below mean something. `detectPatterns()` builds its list
    // from three sources; if one of them silently returned nothing, every `it.each` under it would
    // pass by iterating over an empty array — a green suite asserting about nothing.
    expect(patterns.length).toBeGreaterThan(20);
  });

  it.each(patterns.map((p) => [p.id, p.pattern, p.flags]))("%s compiles", (_id, pattern, flags) => {
    expect(() => new RegExp(pattern, flags)).not.toThrow();
  });

  it.each(patterns.map((p) => [p.id, p.pattern]))("%s has no nested quantifier", (_id, pattern) => {
    expect(findNestedQuantifiers(pattern)).toEqual([]);
  });
});
