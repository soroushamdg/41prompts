import { EXAMPLE_NAME } from "./naming";

/**
 * The one example prompt, as data.
 *
 * ## Why an example exists at all, given the 2026-09-14 ruling
 *
 * Soroush ruled that seeded starter bloks are **not owed**, because an empty state does the job
 * "without fabricating someone's content — which matters on a product whose claim is that a blok
 * holds your verbatim text". That ruling stands. The distinction this epic draws (decision 1) is
 * between content put into *your* prompt without asking — still ruled out, and a blank prompt is
 * still blank — and an example a person explicitly pressed a button to get, named as one.
 *
 * ## The prompt contradicts itself, and that is the whole lesson
 *
 * One blok says never to mention "sorry". Another tells the model to open every reply with "Sorry
 * for the trouble". **A person can see both on one screen and still not notice**, which is the
 * entire thesis of this product stated in four lines — and it is what makes the first run fail
 * (decision 2) without any input being rigged to break anything.
 *
 * The fix is then obvious once the failure names the rule: edit the blok that tells it to
 * apologise. That is a real fix a person would make, not a button that resolves a synthetic
 * problem.
 *
 * ## Why the contradiction is in the *last* blok
 *
 * The deterministic fake answers with the last non-empty line of the prompt it is given. So the
 * last blok is the answer, which means **editing the prompt changes the result** — the example is
 * walkable end to end against the fake, in the e2e and in the drive, without a provider key.
 *
 * An earlier draft put `{{question}}` last, so the answer was the input row. It failed on the same
 * input for ever and *no edit to the prompt could make it pass*, which would have made step four of
 * the journey unreachable in every test. Written down because the shape is easy to recreate.
 *
 * ## Why the expected blok's wording is asserted rather than trusted
 *
 * EPIC-033 found two of ADR-003's eight check kinds unreachable — no rule text could produce them —
 * so a plausible-sounding expected blok can compile to a check that grades nothing. An example in
 * that state would walk this entire journey and prove nothing, because the run the person was told
 * to fix would come back `Not checked`. `example.test.ts` asserts the derived kind.
 */

export const EXAMPLE_PROJECT_NAME = `${EXAMPLE_NAME} project`;
export const EXAMPLE_PROMPT_NAME = `${EXAMPLE_NAME} — support reply`;

/** The variable the input set binds. */
export const EXAMPLE_VARIABLE = "question";

/**
 * The blok a person edits to fix the example. Named so the test and the drive agree on which.
 *
 * **Lower-case `sorry`, and that is not a stylistic choice.** `must_not_contain` compares with
 * `String.includes`, so it is case-sensitive: a rule forbidding `"sorry"` does not fire on `Sorry`.
 * The first draft of this blok opened with `Start every reply with "Sorry for the trouble"` and the
 * example **passed its own check**, which would have shipped an onboarding whose first run
 * demonstrates nothing. Whether that case-sensitivity is right is a product question raised in this
 * epic's report; it is not this epic's to change, and the example works within it rather than
 * around it.
 */
export const EXAMPLE_APOLOGY_BLOK = `Open every reply with "i'm sorry for the trouble".`;

/** What fixing it looks like: the same instruction, without the word the rule forbids. */
export const EXAMPLE_FIXED_BLOK = 'Open every reply with "thanks for writing in".';

export const EXAMPLE_BLOKS: readonly { kind: "context" | "expected"; text: string }[] = [
  { kind: "context", text: "You are a support assistant for a small software company." },
  { kind: "context", text: `The customer wrote: {{${EXAMPLE_VARIABLE}}}` },
  {
    kind: "expected",
    // Derives `must_not_contain` with the needle `sorry`. Quoted on purpose: `paramsFor` declines to
    // infer a phrase from prose, so an unquoted version would derive no parameter and grade nothing.
    text: 'Never mention "sorry".',
  },
  // Last, and the one that breaks the rule above. See the note on ordering.
  { kind: "context", text: EXAMPLE_APOLOGY_BLOK },
];

/**
 * Two inputs, so the run has a shape rather than a single result.
 *
 * Neither is rigged to fail: **the prompt fails them both**, which is the point. Two rather than one
 * because "1 of 2" and "2 of 2" teach what a meter is, and because a set with one row does not look
 * like anything a person would upload.
 */
export const EXAMPLE_INPUT_SET_NAME = "example-inputs.csv";
export const EXAMPLE_COLUMNS: readonly string[] = [EXAMPLE_VARIABLE];
export const EXAMPLE_ROWS: readonly (readonly string[])[] = [
  ["My invoice has the wrong VAT number on it."],
  ["The export button does nothing on Safari."],
];

export { EXAMPLE_NAME };
