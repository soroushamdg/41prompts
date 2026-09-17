import { typescriptPromptsFile } from "@41prompts/core";
import { describe, expect, it } from "vitest";
import { generatedPromptsFile, identifierFor, identifiersFor, type ConnectPrompt } from "./generate";

/**
 * **The algorithm's tests live in `packages/core/src/codegen/typescript.test.ts`** and moved there
 * with it in EPIC-053. What is left here is the seam, and it is the part `apps/web` owns: that the
 * page and `41p pull` write the same bytes.
 *
 * Asserting equality directly rather than trusting that two callers of one function agree is the
 * point — C1 says "proved by a test, not by inspection". A re-export is exactly the kind of thing
 * that quietly becomes a re-implementation during a later refactor, and this is what would catch it.
 */

const prompt = (over: Partial<ConnectPrompt> = {}): ConnectPrompt => ({
  id: "pr_1a2b3c4d",
  name: "Refund classifier",
  variables: [],
  ...over,
});

const CASES: ConnectPrompt[][] = [
  [],
  [prompt()],
  [prompt({ variables: [{ name: "email", optional: false, declared: true }] })],
  [prompt({ variables: [{ name: "customer name", optional: false, declared: true }, { name: "x-locale", optional: true, declared: true }] })],
  [prompt({ name: "2024 refunds", variables: [{ name: "customer_name", optional: true, declared: false }] })],
  [prompt({ id: "pr_aaaaaaaa", name: "Refund classifier" }), prompt({ id: "pr_bbbbbbbb", name: "refund-classifier" })],
];

describe("the Connect page's generator is core's generator", () => {
  it.each(CASES.map((rows, i) => [i, rows] as const))(
    "case %i: the page's output is byte-identical to core's",
    (_i, rows) => {
      expect(generatedPromptsFile(rows)).toBe(typescriptPromptsFile(rows));
    },
  );

  it("re-exports the identifier helpers the page renders its table with", () => {
    expect(identifierFor(prompt())).toBe("refundClassifier");
    expect([...identifiersFor(CASES[5]!).values()]).toEqual(["refundClassifier", "refundClassifier2"]);
  });

  it("carries the ownership sentence EPIC-053 put in the header", () => {
    // The page's copy said "copy this into your project" until EPIC-053; ruling 9 replaced it with
    // `docs/roadmap.md`'s sentence, and it reaches the page because the page is now a caller.
    expect(generatedPromptsFile([prompt()])).toContain("This file is yours; 41Prompts claims no rights in it.");
  });

  it("the equality assertion above can fail", () => {
    // The control. Two different inputs must not compare equal, or every case above is vacuous.
    expect(generatedPromptsFile(CASES[2]!)).not.toBe(typescriptPromptsFile(CASES[3]!));
  });
});
