// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { renameVariable } from "./rename.js";
import { SUPPORT_PROMPT } from "./fixtures/prompts.js";
import type { VariableDeclaration } from "./types.js";

/**
 * **Written before `rename.ts` existed**, for the reason EPIC-021a decision 5 established: rename is
 * the only operation in this epic that can destroy writing. Everything else here inconveniences
 * somebody. This rewrites text a person typed, in several bloks at once, and a bug in it is silent —
 * the prompt still compiles, still looks plausible, and a sentence is wrong.
 */
const declare = (name: string, defaultValue: string | null = null): VariableDeclaration => ({
  name,
  defaultValue,
  description: null
});

const DECLARED = [declare("company", "Acme"), declare("customer_name"), declare("agent_handle")];

describe("renameVariable", () => {
  it("rewrites every occurrence across every blok that has one", () => {
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "company", "vendor");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(result.blokTexts[0]?.text).toContain("support assistant for {{vendor}}");
    expect(result.blokTexts[1]?.text).toContain("on behalf of {{vendor}} without a case id");
  });

  it("rewrites no blok that does not use the name", () => {
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "agent_handle", "signature");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts.map((b) => b.id)).toEqual(["b4"]);
  });

  it("keeps the author's spacing, replacing the name and not the brace form", () => {
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "customer_name", "account");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts[0]?.text).toContain("{{ account }}");
    expect(result.blokTexts[0]?.text).not.toContain("{{account}}");
  });

  it("does not touch a name that merely starts with the one being renamed", () => {
    const bloks = [{ id: "x", kind: "context" as const, order: 0, text: "{{company}} and {{company_id}}" }];
    const result = renameVariable(bloks, [declare("company"), declare("company_id")], "company", "vendor");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts[0]?.text).toBe("{{vendor}} and {{company_id}}");
  });

  it("carries the declaration across, default and description intact", () => {
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "company", "vendor");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.declaration).toEqual({ name: "vendor", defaultValue: "Acme", description: null });
  });

  it("renames a declared variable nothing uses, rewriting no text at all", () => {
    const result = renameVariable(SUPPORT_PROMPT, [...DECLARED, declare("unused")], "unused", "still_unused");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts).toEqual([]);
    expect(result.editedTexts).toEqual([]);
    expect(result.declaration?.name).toBe("still_unused");
  });

  it("rewrites a hand-edited span, and reports it separately from the blok", () => {
    const keep = new Map([["b4", { text: "Sign off as {{agent_handle}} of {{company}}." }]]);
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "company", "vendor", { keep });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.editedTexts.map((e) => e.id)).toEqual(["b4"]);
    expect(result.editedTexts[0]?.text).toBe("Sign off as {{agent_handle}} of {{vendor}}.");
    // b4's own stored text has no `company` in it, so b4 is not in the blok list.
    expect(result.blokTexts.map((b) => b.id)).toEqual(["b1", "b2"]);
  });

  it("refuses a name already in use, rather than silently merging two variables", () => {
    const result = renameVariable(SUPPORT_PROMPT, DECLARED, "company", "customer_name");
    expect(result).toEqual({ ok: false, reason: "target-exists" });
  });

  it("refuses a name that is not a name", () => {
    for (const bad of ["9lives", "two words", "", "has-dash", "{{nested}}"]) {
      expect(renameVariable(SUPPORT_PROMPT, DECLARED, "company", bad)).toEqual({
        ok: false,
        reason: "invalid-name"
      });
    }
  });

  it("refuses to rename a name that is neither used nor declared", () => {
    expect(renameVariable(SUPPORT_PROMPT, DECLARED, "nothing_here", "something")).toEqual({
      ok: false,
      reason: "unknown-name"
    });
  });

  it("renaming to the same name is refused as target-exists, not treated as a no-op", () => {
    expect(renameVariable(SUPPORT_PROMPT, DECLARED, "company", "company")).toEqual({
      ok: false,
      reason: "target-exists"
    });
  });

  it("reaches an expected blok, which is not a use but is still the author's vocabulary", () => {
    const bloks = [
      { id: "c1", kind: "context" as const, order: 0, text: "Answer in the voice of {{tone}}." },
      { id: "x1", kind: "expected" as const, order: 1, text: "The reply matches {{tone}}." }
    ];
    const result = renameVariable(bloks, [declare("tone")], "tone", "voice");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts.map((b) => b.id)).toEqual(["c1", "x1"]);
    expect(result.blokTexts[1]?.text).toBe("The reply matches {{voice}}.");
  });

  it("renames correctly when the new name is longer, which right-to-left replacement is for", () => {
    const bloks = [{ id: "m", kind: "context" as const, order: 0, text: "{{a}} then {{a}} then {{a}}" }];
    const result = renameVariable(bloks, [declare("a")], "a", "a_much_longer_name");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.blokTexts[0]?.text).toBe(
      "{{a_much_longer_name}} then {{a_much_longer_name}} then {{a_much_longer_name}}"
    );
  });

  it("is pure: it returns new texts and mutates nothing it was given", () => {
    const before = JSON.stringify(SUPPORT_PROMPT);
    renameVariable(SUPPORT_PROMPT, DECLARED, "company", "vendor");
    expect(JSON.stringify(SUPPORT_PROMPT)).toBe(before);
  });
});
