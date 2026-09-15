import { checkKindFor, compile, grade, type PromptBlok } from "@41prompts/core";
import { describe, expect, it } from "vitest";
import {
  EXAMPLE_APOLOGY_BLOK,
  EXAMPLE_BLOKS,
  EXAMPLE_FIXED_BLOK,
  EXAMPLE_NAME,
  EXAMPLE_PROMPT_NAME,
  EXAMPLE_ROWS,
  EXAMPLE_VARIABLE,
} from "./example";

const expectedBlok = EXAMPLE_BLOKS.find((blok) => blok.kind === "expected")!;

/**
 * The example has to survive a check, and that is not something to eyeball.
 *
 * EPIC-033 found `refuses_to_answer` unreachable for the whole of Stage 3 — no rule text could
 * produce it — so an expected blok can read perfectly and compile to a check that grades nothing.
 * An example in that state would walk the entire onboarding journey, satisfy every assertion about
 * clicks and pages, and teach the new user nothing, because the run they were told to fix would
 * come back `Not checked`.
 */
describe("the example prompt", () => {
  it("has an expected blok whose check kind can actually be derived", () => {
    expect(checkKindFor(expectedBlok.text)).toBe("must_not_contain");
  });

  it("is named as an example, so it cannot be mistaken for the person's own writing", () => {
    expect(EXAMPLE_PROMPT_NAME).toContain(EXAMPLE_NAME);
  });

  it("binds a variable, so the journey exercises a real input set", () => {
    expect(EXAMPLE_BLOKS.some((blok) => blok.text.includes(`{{${EXAMPLE_VARIABLE}}}`))).toBe(true);
    expect(EXAMPLE_ROWS.every((row) => row.length === 1)).toBe(true);
  });

  /**
   * **Decision 2, asserted against the grader rather than against a hunch.**
   *
   * The prompt contradicts itself: one blok forbids a word and the last one uses it. This compiles
   * the example for real and grades the answer the deterministic fake would give — the last
   * non-empty line — so a reworded blok that accidentally stopped failing fails this test instead of
   * shipping an onboarding where nothing is ever caught.
   */
  it("fails its own check before anybody edits it", () => {
    const verdict = gradeLastLine(EXAMPLE_BLOKS);
    expect(verdict.outcome).toBe("fail");
  });

  /** And the fix works: the same prompt with the apology blok rewritten passes. */
  it("passes once the blok that breaks the rule is fixed", () => {
    const fixed = EXAMPLE_BLOKS.map((blok) =>
      blok.text === EXAMPLE_APOLOGY_BLOK ? { ...blok, text: EXAMPLE_FIXED_BLOK } : blok
    );
    expect(gradeLastLine(fixed).outcome).toBe("pass");
  });

  it("has the blok that breaks the rule last, so editing it changes the answer", () => {
    expect(EXAMPLE_BLOKS[EXAMPLE_BLOKS.length - 1]!.text).toBe(EXAMPLE_APOLOGY_BLOK);
  });
});

/**
 * Compile the example and grade the answer the fake would give it.
 *
 * The fake echoes the last non-empty line of the compiled prompt, so this is the real pipeline —
 * `compile()` then `grade()` — over the real content, rather than a restatement of what the content
 * is meant to do.
 */
function gradeLastLine(bloks: readonly { kind: string; text: string }[]) {
  const compiled = compile(
    bloks.map((blok, index) => ({ id: `blk_${index}`, kind: blok.kind as PromptBlok["kind"], text: blok.text, order: index }))
  );
  const lines = compiled.text.split("\n").filter((line) => line.trim() !== "");
  const answer = lines[lines.length - 1]!;
  const check = compiled.checks[0]!;
  return grade(check, answer);
}
