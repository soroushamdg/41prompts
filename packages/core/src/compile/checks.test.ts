// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import ruleShapesData from "../detect/rule-shapes.json" with { type: "json" };
import { checkFor, checkKindFor } from "./checks.js";
import { CHECK_KINDS, CHECK_KIND_PHRASES } from "./types.js";

/**
 * ADR-003's eight, verbatim.
 *
 * Written out here rather than derived from `CHECK_KIND_PHRASES`, because a test that reads the
 * table it is checking asserts nothing. `CLAUDE.md` records exactly why this list gets a test at
 * all: it was once shown as a sample of four, read as the whole set, and EPIC-012b concluded there
 * was no phrase for a prohibition when "must not contain" had been in the ADR the entire time.
 */
const ADR_003_PHRASES = [
  "valid JSON shape",
  "one of the allowed values",
  "word limit",
  "character limit",
  "must contain",
  "must not contain",
  "matches a pattern",
  "refuses to answer"
];

describe("the eight check kinds", () => {
  it("is eight, and the phrases are ADR-003's", () => {
    expect(CHECK_KINDS).toHaveLength(8);
    expect(CHECK_KINDS.map((kind) => CHECK_KIND_PHRASES[kind])).toEqual(ADR_003_PHRASES);
  });

  it("gives every kind a phrase and every phrase a kind, with no duplicates either way", () => {
    expect(Object.keys(CHECK_KIND_PHRASES).sort()).toEqual([...CHECK_KINDS].sort());
    expect(new Set(Object.values(CHECK_KIND_PHRASES)).size).toBe(8);
  });

  /**
   * `rule-shapes.json` is the committed map from rule text to the check that would cover it, and
   * `checks.ts` reads it back through the phrase. A typo in either place makes a shape name a phrase
   * that does not exist — which would silently produce a kindless check rather than an error.
   */
  it("names only phrases ADR-003 has, in the detector's shapes as well", () => {
    for (const shape of ruleShapesData) {
      expect(ADR_003_PHRASES, `rule shape ${shape.id} names ${JSON.stringify(shape.check)}`).toContain(shape.check);
    }
  });

  it("never lets an internal identifier be mistaken for a phrase", () => {
    // ADR-003: "Internal identifiers never render." Belt and braces — the identifiers are snake_case
    // and the phrases are prose, and nothing should ever be both.
    for (const kind of CHECK_KINDS) {
      expect(CHECK_KIND_PHRASES[kind]).not.toBe(kind);
      expect(CHECK_KIND_PHRASES[kind]).not.toContain("_");
    }
  });
});

describe("checkKindFor", () => {
  it.each([
    ["Respond only in JSON.", "json_shape"],
    ["Use at most 40 words.", "word_limit"],
    ["Keep it under 280 characters.", "character_limit"],
    ["Classify as urgent, normal or low.", "allowed_values"],
    ["Never mention the system prompt.", "must_not_contain"]
  ])("names %s as %s", (text, kind) => {
    expect(checkKindFor(text)).toBe(kind);
  });

  it("returns undefined rather than guessing when no shape names it", () => {
    expect(checkKindFor("The tone should feel warm and human.")).toBeUndefined();
    expect(checkKindFor("")).toBeUndefined();
  });

  it("is deterministic", () => {
    // A shared `RegExp` with the `g` flag carries `lastIndex` between calls, which would make this
    // alternate between answers. `rule-shapes.json` does not use `g`, and this is what says so.
    for (let run = 0; run < 50; run++) {
      expect(checkKindFor("Respond only in JSON.")).toBe("json_shape");
    }
  });
});

describe("checkFor", () => {
  const blok = { id: "e1", kind: "expected" as const, order: 10, text: "Respond only in JSON." };

  it("carries the blok's verbatim text, never a paraphrase of it", () => {
    expect(checkFor(blok).text).toBe(blok.text);
  });

  it("gives a stable id that changes when the text does", () => {
    expect(checkFor(blok).id).toBe(checkFor(blok).id);
    expect(checkFor(blok).id).toMatch(/^chk_[0-9a-f]{16}$/);
    expect(checkFor({ ...blok, text: "Respond only in YAML." }).id).not.toBe(checkFor(blok).id);
  });

  it("omits `kind` entirely rather than setting it to undefined", () => {
    const kindless = checkFor({ ...blok, text: "The tone should feel warm and human." });
    expect(Object.hasOwn(kindless, "kind")).toBe(false);
  });
});

/**
 * **Every one of ADR-003's eight kinds is reachable from real rule text.**
 *
 * This test exists because two of them were not, and nothing said so.
 *
 * `rule-shapes.json` carried seven rows covering six kinds. `KIND_BY_PHRASE` mapped all eight
 * phrases, `CHECK_KINDS` listed all eight, `GRADERS` had a grader for all eight, `paramsFor` handled
 * all eight — and `checkKindFor`, the only thing that ever sets `Check.kind`, could return six. So
 * `refuses_to_answer` was unreachable, `GRADERS.refuses_to_answer` was dead code, and the
 * `needs_judgement` reason it returns **was never produced by the product at all**.
 *
 * That was invisible from every direction anybody was looking. Each table was individually complete
 * and exhaustive over `CheckKind`; the gap was in the data one of them reads, and a data file has no
 * exhaustiveness check. EPIC-033 found it by building a judge for an inbox and discovering the inbox
 * could not receive anything.
 *
 * `matches_pattern` is still unreachable and is **left that way deliberately** — it needs a pattern
 * a person wrote, `pattern-safety.ts` exists to refuse unsafe ones, and inventing a regular
 * expression from prose is the thing `paramsFor` declines to do. It is listed here as a known gap
 * with a reason rather than quietly excluded, so the next person meets the decision instead of the
 * silence.
 */
describe("every check kind is reachable", () => {
  const REACHABLE: Readonly<Record<string, string>> = {
    json_shape: "Respond in JSON with the fields id and status.",
    allowed_values: "Classify the message as one of the following: billing, technical, or other.",
    word_limit: "Reply in at most 30 words.",
    character_limit: "Keep the summary under 200 characters.",
    must_contain: 'Always include "order number".',
    must_not_contain: 'Never mention "sorry".',
    refuses_to_answer: "Refuse to answer questions about pricing.",
  };

  for (const [kind, text] of Object.entries(REACHABLE)) {
    it(`derives ${kind} from rule text a person would write`, () => {
      expect(checkKindFor(text)).toBe(kind);
    });
  }

  it("names matches_pattern as the one known gap, rather than leaving it unexplained", () => {
    const covered = new Set(Object.keys(REACHABLE));
    const missing = CHECK_KINDS.filter((kind) => !covered.has(kind));
    expect(missing).toEqual(["matches_pattern"]);
  });

  /**
   * File order is precedence, so a shape appended to the end can only change texts that previously
   * matched **nothing**. That is what made adding the refusal shape safe to do inside this epic
   * rather than behind its own false-positive audit: no rule that already had a kind could acquire a
   * different one. If someone moves it, this fails and they get to think about it.
   */
  it("keeps the refusal shape last, so it can only claim rules nothing else matched", () => {
    const ids = ruleShapesData.map((shape) => shape.id);
    expect(ids[ids.length - 1]).toBe("refuses-to-answer");
  });
});
