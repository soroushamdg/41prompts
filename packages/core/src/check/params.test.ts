// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { paramsFor } from "./params.js";
import { suggestFor } from "./suggest.js";
import type { Check } from "../compile/types.js";

describe("deriving what a check needs", () => {
  it("takes a word limit from the number that is there", () => {
    expect(paramsFor("word_limit", "Reply in at most 80 words.")).toEqual({ kind: "word_limit", limit: 80 });
  });

  it("takes no word limit from a rule that names no number", () => {
    expect(paramsFor("word_limit", "Reply briefly.")).toBeUndefined();
    expect(paramsFor("word_limit", "Keep it short and to the point.")).toBeUndefined();
  });

  it("takes a quoted phrase, and nothing from an unquoted one", () => {
    expect(paramsFor("must_contain", 'Always include "order number".')).toEqual({
      kind: "must_contain",
      needle: "order number"
    });
    // Inferring the phrase from the prose would be inventing an assertion nobody wrote.
    expect(paramsFor("must_contain", "Always include the order number.")).toBeUndefined();
  });

  it("takes a list of two or more, and rejects a list of one", () => {
    expect(paramsFor("allowed_values", "Reply with one of: yes, no, maybe")).toEqual({
      kind: "allowed_values",
      values: ["yes", "no", "maybe"]
    });
    expect(paramsFor("allowed_values", "Reply with one of: yes")).toBeUndefined();
  });

  it("takes JSON keys from quoted identifiers", () => {
    const params = paramsFor("json_shape", 'Return JSON with "intent" and "confidence".');
    expect(params).toEqual({ kind: "json_shape", expectedKeys: ["intent", "confidence"] });
  });

  it("refuses a pattern the filter rejects, at derivation rather than at grade time", () => {
    expect(paramsFor("matches_pattern", 'Must match "(a+)+$".')).toBeUndefined();
    expect(paramsFor("matches_pattern", 'Must match "^[A-Z]{2}$".')).toEqual({
      kind: "matches_pattern",
      pattern: "^[A-Z]{2}$",
      flags: ""
    });
  });

  it("needs nothing for refuses_to_answer", () => {
    expect(paramsFor("refuses_to_answer", "Refuses out-of-scope questions.")).toEqual({ kind: "refuses_to_answer" });
  });

  it("is deterministic", () => {
    const text = "Reply in at most 80 words.";
    const first = paramsFor("word_limit", text);
    for (let i = 0; i < 20; i++) expect(paramsFor("word_limit", text)).toEqual(first);
  });
});

/**
 * A suggested **check**, never a suggested rewording.
 *
 * Ruled 2026-09-14, and it follows from `CLAUDE.md` rule 3: the compiler must not emit a paraphrase
 * of user text, and a suggested rewording is that with extra steps.
 */
describe("suggestions", () => {
  const check = (partial: Partial<Check> & Pick<Check, "id" | "blokId" | "text">) => partial as Check;

  it("says nothing about a check that already works", () => {
    const working = check({ id: "c", blokId: "b", text: "Reply in at most 80 words.", kind: "word_limit" });
    expect(suggestFor([working])).toEqual([]);
  });

  it("names the kind and what is missing when the kind is known", () => {
    const vague = check({ id: "c", blokId: "b", text: "Reply briefly.", kind: "word_limit" });
    expect(suggestFor([vague])).toEqual([
      { blokId: "b", checkId: "c", kind: "word_limit", phrase: "word limit", missing: ["a number of words"] }
    ]);
  });

  it("uses ADR-003's phrase, never the internal identifier", () => {
    const vague = check({ id: "c", blokId: "b", text: "Must include something.", kind: "must_contain" });
    const [suggestion] = suggestFor([vague]);
    expect(suggestion!.phrase).toBe("must contain");
    expect(suggestion!.phrase).not.toBe("must_contain");
  });

  it("names nothing when no shape matched, rather than picking the nearest kind", () => {
    const unmatched = check({ id: "c", blokId: "b", text: "Be generally helpful." });
    expect(suggestFor([unmatched])).toEqual([{ blokId: "b", checkId: "c", missing: [] }]);
  });

  it("never returns the author's text back to them, reworded or otherwise", () => {
    const text = "Reply briefly and with warmth.";
    const vague = check({ id: "c", blokId: "b", text, kind: "word_limit" });
    const json = JSON.stringify(suggestFor([vague]));
    expect(json).not.toContain("warmth");
    expect(json).not.toContain(text);
  });

  it("says nothing for refuses_to_answer, which is waiting on a judge and not on the author", () => {
    const refusal = check({ id: "c", blokId: "b", text: "Refuses out-of-scope questions.", kind: "refuses_to_answer" });
    expect(suggestFor([refusal])).toEqual([]);
  });
});
