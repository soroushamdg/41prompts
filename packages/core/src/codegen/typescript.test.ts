// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Moved from `apps/web/lib/connect/generate.test.ts` by EPIC-053, with every behavioural assertion
 * unchanged. The two that changed are the header ones, deliberately — ruling 9 replaces EPIC-055's
 * *"copy this into your project"* with `docs/roadmap.md`'s ownership sentence, and the old
 * assertions are kept below as the thing that must no longer be true rather than deleted.
 */

import { describe, expect, it } from "vitest";
import { LICENCE_LINE } from "./header.js";
import { identifierFor, identifiersFor } from "./identifiers.js";
import { typescriptPromptsFile } from "./typescript.js";
import type { CodegenPrompt } from "./types.js";

const prompt = (over: Partial<CodegenPrompt> = {}): CodegenPrompt => ({
  id: "pr_1a2b3c4d",
  name: "Refund classifier",
  variables: [],
  ...over,
});

describe("the identifier a prompt name becomes", () => {
  it("camel-cases the ordinary cases", () => {
    expect(identifierFor(prompt({ name: "Refund classifier" }))).toBe("refundClassifier");
    expect(identifierFor(prompt({ name: "refund-classifier" }))).toBe("refundClassifier");
    expect(identifierFor(prompt({ name: "refund_classifier" }))).toBe("refundClassifier");
    expect(identifierFor(prompt({ name: "REFUND CLASSIFIER" }))).toBe("rEFUNDCLASSIFIER");
    expect(identifierFor(prompt({ name: "refundClassifier" }))).toBe("refundClassifier");
  });

  it("puts a letter in front of a leading digit, because 2024Refunds does not parse", () => {
    expect(identifierFor(prompt({ name: "2024 refunds" }))).toBe("p2024Refunds");
    expect(identifierFor(prompt({ name: "4 1 prompts" }))).toBe("p41Prompts");
  });

  it("falls back to the id when the name has nothing to work with", () => {
    expect(identifierFor(prompt({ name: "***" }))).toBe("prompt_pr1a2b3c4d");
    expect(identifierFor(prompt({ name: "" }))).toBe("prompt_pr1a2b3c4d");
    expect(identifierFor(prompt({ name: "   " }))).toBe("prompt_pr1a2b3c4d");
  });

  it("keeps non-ASCII letters, which are legal in a TypeScript identifier", () => {
    expect(identifierFor(prompt({ name: "résumé parser" }))).toBe("résuméParser");
  });

  it("resolves a collision rather than emitting the same name twice", () => {
    const ids = identifiersFor([
      prompt({ id: "pr_aaaaaaaa", name: "Refund classifier" }),
      prompt({ id: "pr_bbbbbbbb", name: "refund-classifier" }),
      prompt({ id: "pr_cccccccc", name: "REFUND_CLASSIFIER".toLowerCase() }),
    ]);
    expect([...ids.values()]).toEqual(["refundClassifier", "refundClassifier2", "refundClassifier3"]);
  });
});

describe("the generated prompts.ts", () => {
  it("writes one function per prompt, with the id inline", () => {
    const file = typescriptPromptsFile([
      prompt({ id: "pr_1a2b3c4d", name: "Refund classifier", variables: [{ name: "email", optional: false, declared: true }] }),
    ]);
    expect(file).toContain('import { createClient } from "@41prompts/sdk";');
    expect(file).toContain("const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });");
    expect(file).toContain("export function refundClassifier(v: { email: string }) {");
    expect(file).toContain('return prompts.resolve("pr_1a2b3c4d", v);');
  });

  it("marks a variable with a default as optional", () => {
    const file = typescriptPromptsFile([
      prompt({
        variables: [
          { name: "email", optional: false, declared: true },
          { name: "locale", optional: true, declared: true },
        ],
      }),
    ]);
    expect(file).toContain("v: { email: string; locale?: string }");
  });

  it("takes no argument when a prompt declares nothing", () => {
    const file = typescriptPromptsFile([prompt({ name: "Daily summary" })]);
    expect(file).toContain("export function dailySummary() {");
    expect(file).toContain('return prompts.resolve("pr_1a2b3c4d");');
    // Not an empty object: a signature you satisfy with `{}` teaches the wrong thing.
    expect(file).not.toContain("dailySummary(v: {  })");
  });

  it("quotes a variable name that is not an identifier", () => {
    // Variable names come from `{{…}}` in somebody's prompt text and are not constrained.
    const file = typescriptPromptsFile([
      prompt({ variables: [{ name: "customer name", optional: false, declared: true }, { name: "x-locale", optional: true, declared: true }] }),
    ]);
    expect(file).toContain('"customer name": string');
    expect(file).toContain('"x-locale"?: string');
  });

  /**
   * The drive found this and it is the reason the signature is built from **uses** rather than
   * declarations (EPIC-055, report §6).
   */
  it("takes an undeclared variable, and takes it as required", () => {
    const file = typescriptPromptsFile([
      prompt({
        variables: [
          { name: "order_id", optional: true, declared: true },
          { name: "customer_name", optional: false, declared: false },
        ],
      }),
    ]);
    expect(file).toContain("v: { order_id?: string; customer_name: string }");
  });

  it("never marks an undeclared variable optional, whatever it is told", () => {
    const file = typescriptPromptsFile([
      prompt({ variables: [{ name: "customer_name", optional: true, declared: false }] }),
    ]);
    expect(file).toContain("v: { customer_name: string }");
    expect(file).not.toContain("customer_name?");
  });

  it("says so when a project has no prompts, rather than emitting an empty module", () => {
    const file = typescriptPromptsFile([]);
    expect(file).toContain("This project has no prompts yet");
    expect(file).not.toContain("createClient");
  });

  it("separates functions with a blank line and ends with one newline", () => {
    const file = typescriptPromptsFile([
      prompt({ id: "pr_aaaaaaaa", name: "One" }),
      prompt({ id: "pr_bbbbbbbb", name: "Two" }),
    ]);
    expect(file).toContain("}\n\nexport function two()");
    expect(file.endsWith("}\n")).toBe(true);
  });

  describe("the header, which EPIC-053 changed", () => {
    it("carries the roadmap's ownership sentence verbatim", () => {
      // `docs/roadmap.md`'s EPIC-053 Tasks line names this string. It is asserted as a literal
      // rather than by `LICENCE_LINE` alone so that renaming the constant cannot quietly reword it.
      expect(typescriptPromptsFile([prompt()])).toContain(
        "// This file is yours; 41Prompts claims no rights in it.",
      );
      expect(LICENCE_LINE).toBe("This file is yours; 41Prompts claims no rights in it.");
    });

    it("no longer says a person copied it, because now a command writes it", () => {
      // EPIC-055 ruling 3's header, kept here as the thing that must no longer be true.
      const file = typescriptPromptsFile([prompt()]);
      expect(file).not.toContain("copy this into your project");
      expect(file).toContain("Regenerate it when you add one");
    });

    it("is on the empty file too — ownership does not depend on there being prompts", () => {
      expect(typescriptPromptsFile([])).toContain(LICENCE_LINE);
    });
  });
});
