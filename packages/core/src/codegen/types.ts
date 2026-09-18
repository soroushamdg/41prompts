// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * The rows a generated bindings file is written from (EPIC-053).
 *
 * ## Why this is in `packages/core` and not in the two places that want it
 *
 * `apps/web`'s Connect page generates `prompts.ts` so a person can copy it (EPIC-055 ruling 3), and
 * `41p pull` writes the same file into their repository. EPIC-055 committed to those being the same
 * file *"precisely"* — and `CLAUDE.md` rule 11 forbids `packages/cli` importing `apps/*`, so the CLI
 * cannot call the page's copy where it lives.
 *
 * Two implementations of one file format is the defect this repository has already refused three
 * times: two copies of an env placeholder, two copies of `buildHashOf` (*"the failure mode of a
 * second copy being that verification quietly always passes"*), and two implementations of the
 * publish gate. **The copy goes stale silently**, and the stale one here writes into a customer's
 * repository. So the generator lives here and both are callers. EPIC-053 ruling 1.
 *
 * Everything in this directory is pure: no IO, no DOM, no clock, no network. That is what makes a
 * golden file an honest test of it.
 */

/** One prompt, as a bindings file needs to see it. */
export interface CodegenPrompt {
  readonly id: string;
  readonly name: string;
  /**
   * Every variable the prompt **uses**, not only the ones it declares.
   *
   * ## The drive found this, and the difference is the whole point of the file
   *
   * A prompt whose text says `{{customer_name}}` while nothing has declared that name is a prompt
   * with a real input and no contract. Generating the signature from declarations alone produced
   * `refundClassifier(v: { order_id: string })` for a prompt that also needs `customer_name` — so a
   * developer copying the file gets a function TypeScript will not let them pass the missing name
   * to, and the model receives a prompt with `{{customer_name}}` still in it.
   *
   * `packages/sdk-ts/README.md` names that failure in as many words: *"Sending a model a prompt with
   * `{{customer_name}}` still in it produces a confident answer about a customer called
   * 'customer_name', and nobody notices for a week."* A generated file that causes it is worse than
   * no generated file.
   *
   * So the signature is built from **uses**, and `declared` records whether each one has a contract
   * — the Connect page says which do not, because an undeclared variable is a real gap rather than a
   * detail this file should paper over.
   */
  readonly variables: readonly CodegenVariable[];
}

export interface CodegenVariable {
  readonly name: string;
  /**
   * Whether the caller may omit it.
   *
   * **Only a declared variable can be optional.** Optionality comes from a default, and a name
   * nothing declares has no default to fall back on — so both generators ignore `optional` when
   * `declared` is false rather than trusting the pair.
   */
  readonly optional: boolean;
  readonly declared: boolean;
}

/** Which bindings file to write. */
export type CodegenLanguage = "typescript" | "python";

/** The file name each language's bindings land in. */
export const CODEGEN_FILENAME: Readonly<Record<CodegenLanguage, string>> = {
  typescript: "prompts.ts",
  python: "prompts.py",
};
