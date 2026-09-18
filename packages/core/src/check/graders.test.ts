// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { CHECK_KINDS, type CheckKind } from "../compile/types.js";
import { countCharacters, countWords, GRADERS } from "./graders.js";
import type { CheckParams } from "./params.js";

/**
 * Five positive and five negative per grader, as the epic asks.
 *
 * `refuses_to_answer` is the exception and has its own block: it never returns pass or fail, by
 * ruling, so five of each would be five assertions about behaviour that must not exist.
 */

function run(params: CheckParams, output: string) {
  return GRADERS[params.kind](params, output);
}

describe("the table is the eight and only the eight", () => {
  it("has exactly one grader per kind in CHECK_KINDS", () => {
    expect(Object.keys(GRADERS).sort()).toEqual([...CHECK_KINDS].sort());
  });

  it("names no kind that CHECK_KINDS does not", () => {
    for (const key of Object.keys(GRADERS)) {
      expect(CHECK_KINDS).toContain(key as CheckKind);
    }
  });
});

describe("json_shape", () => {
  const params = { kind: "json_shape", expectedKeys: ["intent", "confidence"] } as const;

  it.each([
    ['{"intent":"refund","confidence":0.9}', "exact keys"],
    ['{"confidence":0.9,"intent":"refund"}', "keys in the other order"],
    ['{"intent":"a","confidence":1,"extra":true}', "a superset"],
    ['  {"intent":"a","confidence":1}  ', "surrounded by whitespace"],
    ['{"intent":null,"confidence":null}', "null values still satisfy the shape"]
  ])("passes: %s (%s)", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each([
    ["not json at all", "unparseable"],
    ['{"intent":"a"}', "a missing key"],
    ["[]", "an array is not an object"],
    ["null", "null is not an object"],
    ['"a string"', "a bare string"]
  ])("fails: %s (%s)", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });

  it("compares keys sorted, so insertion order cannot decide the answer", () => {
    const a = run(params, '{"intent":"x","confidence":1}');
    const b = run(params, '{"confidence":1,"intent":"x"}');
    expect(a).toEqual(b);
  });
});

describe("allowed_values", () => {
  const params = { kind: "allowed_values", values: ["shipping_issue", "faulty_item", "changed_mind"] } as const;

  it.each([
    "shipping_issue",
    "faulty_item",
    "changed_mind",
    "  shipping_issue  ",
    "SHIPPING_ISSUE"
  ])("passes: %j", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each(["", "refund", "shipping issue", "shipping_issue and more", "faulty"])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });
});

describe("word_limit", () => {
  const params = { kind: "word_limit", limit: 5 } as const;

  it.each(["", "one", "one two", "one two three four", "one two three four five"])("passes: %j", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each([
    "one two three four five six",
    "a b c d e f g",
    "  spread   out   over   many   words   here  ",
    "line\nbreaks\ncount\nas\nseparators\ntoo",
    "tabs\tare\twhitespace\tas\twell\there"
  ])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });

  it("names the unit in its evidence, so the number can be reproduced", () => {
    const verdict = run(params, "one two three four five six");
    expect(verdict.outcome).toBe("fail");
    if (verdict.outcome === "fail" && verdict.evidence.kind === "measurement") {
      expect(verdict.evidence.counting).toBe("words");
      expect(verdict.evidence.measured).toBe(6);
      expect(verdict.evidence.limit).toBe(5);
    } else {
      throw new Error("expected a measurement");
    }
  });
});

describe("character_limit", () => {
  const params = { kind: "character_limit", limit: 10 } as const;

  it.each(["", "short", "exactlyten", "🚀", "👩‍💻"])("passes: %j", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each([
    "this is far too long to fit",
    "elevenchars",
    "🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀🚀",
    "0123456789A",
    "           "
  ])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });

  /**
   * The reason `countCharacters` exists rather than `.length`.
   *
   * `"👩‍💻"` is 5 UTF-16 code units and 3 code points. Counting code units would fail a ten-character
   * limit on two emoji, which is not what anybody means by ten characters.
   */
  it("counts code points, not UTF-16 code units", () => {
    expect("👩‍💻".length).toBe(5);
    expect(countCharacters("👩‍💻")).toBe(3);
    expect(run(params, "👩‍💻👩‍💻").outcome).toBe("pass");
  });
});

describe("must_contain", () => {
  const params = { kind: "must_contain", needle: "order number" } as const;

  it.each([
    "your order number is 41",
    "order number",
    "prefix order number suffix",
    "ORDER order number",
    "order number order number"
  ])("passes: %j", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each(["", "ordernumber", "Order Number", "order  number", "number order"])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });

  it("points at where it found it rather than describing it", () => {
    const verdict = run(params, "your order number is 41");
    if (verdict.outcome === "pass" && verdict.evidence.kind === "excerpt") {
      expect(verdict.evidence.text).toBe("order number");
      expect(verdict.evidence.start).toBe(5);
      expect(verdict.evidence.end).toBe(17);
    } else {
      throw new Error("expected an excerpt");
    }
  });
});

describe("must_not_contain", () => {
  const params = { kind: "must_not_contain", needle: "guarantee" } as const;

  it.each(["", "no promises here", "guarantees is a different word? no it is not", "Guarantee", "guarantE"])(
    "passes: %j",
    (output) => {
      // "guarantees" contains "guarantee", so that row is deliberately the one that fails below.
      const expected = output.includes("guarantee") ? "fail" : "pass";
      expect(run(params, output).outcome).toBe(expected);
    }
  );

  it.each([
    "we guarantee a refund",
    "guarantee",
    "GUARANTEE guarantee",
    "a guarantee, of sorts",
    "guaranteed? guarantee."
  ])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });

  it("shows the forbidden text and where it is, because that is the actionable half", () => {
    const verdict = run(params, "we guarantee a refund");
    if (verdict.outcome === "fail" && verdict.evidence.kind === "excerpt") {
      expect(verdict.evidence.text).toBe("guarantee");
      expect(verdict.evidence.start).toBe(3);
    } else {
      throw new Error("expected an excerpt");
    }
  });
});

describe("matches_pattern", () => {
  const params = { kind: "matches_pattern", pattern: "^[A-Z]{2}-\\d{4}$", flags: "" } as const;

  it.each(["AB-1234", "ZZ-0000", "QQ-9999", "AA-0001", "XY-4141"])("passes: %j", (output) => {
    expect(run(params, output).outcome).toBe("pass");
  });

  it.each(["ab-1234", "AB-123", "AB-12345", "", "AB1234"])("fails: %j", (output) => {
    expect(run(params, output).outcome).toBe("fail");
  });
});

/**
 * The one that never grades, and the block is short because the behaviour is "does not happen".
 *
 * Ruled 2026-09-14: a phrase list fires on any prompt containing "I cannot", and false positives are
 * what EPIC-012a spent an epic avoiding.
 */
describe("refuses_to_answer", () => {
  const params = { kind: "refuses_to_answer" } as const;

  it.each([
    "I cannot help with that",
    "Sure, here is the answer",
    "",
    "I cannot stress enough how much I can help",
    "Je ne peux pas vous aider"
  ])("is not graded, whatever the output says: %j", (output) => {
    const verdict = run(params, output);
    expect(verdict.outcome).toBe("not_graded");
    if (verdict.outcome === "not_graded") expect(verdict.reason).toBe("needs_judgement");
  });

  it("never returns pass or fail for any of them", () => {
    const outputs = ["I cannot", "yes", "no", "I'm not able to", "absolutely"];
    for (const output of outputs) {
      expect(run(params, output).outcome).not.toBe("pass");
      expect(run(params, output).outcome).not.toBe("fail");
    }
  });
});

describe("counting is the same everywhere it is used", () => {
  it("counts words as runs of non-whitespace, not with a locale segmenter", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
    expect(countWords("one")).toBe(1);
    expect(countWords(" one   two\tthree\nfour ")).toBe(4);
    // A hyphenated word is one run, which is the rule stated rather than a judgement about English.
    expect(countWords("state-of-the-art")).toBe(1);
  });
});
