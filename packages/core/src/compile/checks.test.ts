// SPDX-FileCopyrightText: 2026 <legal entity>
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
