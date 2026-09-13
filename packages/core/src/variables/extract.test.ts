// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { extractVariables, usedVariableNames } from "./extract.js";
import { variableIssues } from "./issues.js";
import { isOptional } from "./types.js";
import { EXPECTATION_ONLY, NOT_VARIABLES, NO_VARIABLES, SUPPORT_PROMPT } from "./fixtures/prompts.js";
import type { VariableDeclaration } from "./types.js";

const declare = (name: string, defaultValue: string | null = null): VariableDeclaration => ({
  name,
  defaultValue,
  description: null
});

describe("extractVariables", () => {
  it("finds every occurrence, in the prompt's reading order", () => {
    const found = extractVariables(SUPPORT_PROMPT);
    expect(found.map((o) => `${o.blokId}:${o.name}`)).toEqual([
      "b1:company",
      "b1:customer_name",
      "b2:company",
      "b3:customer_name",
      "b4:agent_handle"
    ]);
  });

  it("offsets cover the whole brace form, so a rename can replace exactly that", () => {
    const [first] = extractVariables(SUPPORT_PROMPT);
    const blok = SUPPORT_PROMPT.find((b) => b.id === first?.blokId);
    expect(blok?.text.slice(first?.start, first?.end)).toBe("{{company}}");
  });

  it("tolerates whitespace inside the braces, which is how the existing fixtures write it", () => {
    const withSpaces = extractVariables(SUPPORT_PROMPT).find((o) => o.name === "customer_name");
    const blok = SUPPORT_PROMPT.find((b) => b.id === withSpaces?.blokId);
    expect(blok?.text.slice(withSpaces?.start, withSpaces?.end)).toBe("{{ customer_name }}");
    expect(withSpaces?.name).toBe("customer_name");
  });

  it("does not treat an expected blok as a use, because it compiles to a check and not to text", () => {
    expect(extractVariables(EXPECTATION_ONLY)).toEqual([]);
  });

  it("does treat an example blok as a use, because the model reads it", () => {
    const inExample = extractVariables(SUPPORT_PROMPT).filter((o) => o.blokId === "b3");
    expect(inExample.map((o) => o.name)).toEqual(["customer_name"]);
  });

  it.each(NOT_VARIABLES.map((b) => [b.id, b.text] as const))(
    "leaves %s literal rather than reporting it",
    (id) => {
      expect(extractVariables(NOT_VARIABLES).filter((o) => o.blokId === id)).toEqual([]);
    }
  );

  it("answers an empty array for a prompt with no braces", () => {
    expect(extractVariables(NO_VARIABLES)).toEqual([]);
  });

  it("returns the same answer when called twice, which a shared global regex would not", () => {
    expect(extractVariables(SUPPORT_PROMPT)).toEqual(extractVariables(SUPPORT_PROMPT));
  });

  it("reads a hand edit instead of the blok, because the hand edit is what ships", () => {
    const keep = new Map([["b4", { text: "Sign off as {{signature}}." }]]);
    const names = usedVariableNames(extractVariables(SUPPORT_PROMPT, { keep }));
    expect(names).toContain("signature");
    expect(names).not.toContain("agent_handle");
    const occurrence = extractVariables(SUPPORT_PROMPT, { keep }).find((o) => o.name === "signature");
    expect(occurrence?.source).toBe("edited by hand");
  });

  it("a variable edited out of a span stops being used", () => {
    const keep = new Map([["b4", { text: "Sign off with your own name." }]]);
    expect(usedVariableNames(extractVariables(SUPPORT_PROMPT, { keep }))).not.toContain("agent_handle");
  });
});

describe("variableIssues", () => {
  it("reports a used name nothing declares, with every place it is written", () => {
    const occurrences = extractVariables(SUPPORT_PROMPT);
    const issues = variableIssues(occurrences, [declare("customer_name"), declare("agent_handle")]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.kind).toBe("used_but_not_declared");
    expect(issues[0]?.name).toBe("company");
    expect(issues[0]?.occurrences.map((o) => o.blokId)).toEqual(["b1", "b2"]);
  });

  it("reports a declared name nothing uses, with no occurrences because that is what it means", () => {
    const issues = variableIssues(extractVariables(NO_VARIABLES), [declare("unused_one")]);
    expect(issues).toEqual([{ kind: "declared_but_not_used", name: "unused_one", occurrences: [] }]);
  });

  it("is empty when the two sets agree", () => {
    const declared = ["company", "customer_name", "agent_handle"].map((n) => declare(n));
    expect(variableIssues(extractVariables(SUPPORT_PROMPT), declared)).toEqual([]);
  });

  it("puts uses before unused declarations, because one of them ships to a customer", () => {
    const issues = variableIssues(extractVariables(SUPPORT_PROMPT), [declare("zebra")]);
    expect(issues.map((i) => i.kind)).toEqual([
      "used_but_not_declared",
      "used_but_not_declared",
      "used_but_not_declared",
      "declared_but_not_used"
    ]);
  });
});

describe("isOptional", () => {
  it("is optional exactly when it has a default to fall back on", () => {
    expect(isOptional(declare("a", "Acme"))).toBe(true);
    expect(isOptional(declare("a", ""))).toBe(true);
    expect(isOptional(declare("a", null))).toBe(false);
  });
});
