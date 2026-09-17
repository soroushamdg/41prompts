// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Three exit codes, and the distinction between two of them is the whole value of `41p check` in CI
 * (EPIC-053 ruling 7).
 *
 * | code | name | means |
 * |---|---|---|
 * | 0 | `OK` | the command did what it was asked |
 * | 1 | `ANSWERED_NO` | a real negative answer: the lockfile is stale, a variable is missing |
 * | 2 | `CANNOT_ANSWER` | the question could not be put: no config, no key, a refusal, no network |
 *
 * **`1` and `2` must never be confused.** A build that fails identically for *"somebody published a
 * new version and this repository has not pulled it"* and *"this CI job has no credential"* teaches
 * people to ignore both, and the first is a legitimate failure with an obvious fix while the second
 * is a broken pipeline.
 *
 * This is `scripts/gates.mjs`'s `PARTIAL` verdict one repository over, and the failure it prevents
 * has cost this project time twice: *"no database here" indistinguishable from "this code is
 * broken"* (`docs/PROCESS.md`, "A local gate is evidence only when it reports every package"), and
 * again when `pnpm e2e` started an app with no signing secret and eleven tests failed without one of
 * them naming an environment variable.
 *
 * `2` is also what an unknown command and a bad flag exit with: the shell's convention for misuse,
 * and the same category — the question could not be put.
 */

export const EXIT = {
  OK: 0,
  ANSWERED_NO: 1,
  CANNOT_ANSWER: 2,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/**
 * A command's result: a code and what to say.
 *
 * Commands return this rather than calling `process.exit`, so that a test can run one and read the
 * answer without the process dying underneath the runner. `bin.ts` is the only place that exits.
 */
export interface CommandResult {
  readonly code: ExitCode;
  /** Lines for stdout — the command's actual output, safe to pipe. Each gets a newline. */
  readonly out?: readonly string[];
  /**
   * Bytes for stdout, written verbatim with **no newline added**.
   *
   * Only `41p run` uses this, and it has to. A compiled prompt ends with whatever the compiler
   * produced — `compile()`'s output ends in a newline — and this command's entire claim is *"this is
   * what your program sends"*. Appending a byte would make `41p run x > prompt.txt` write a file
   * that is not the prompt, and trimming one would be worse: a silent edit to the thing being
   * inspected, by the tool you reached for because you did not trust what was being sent.
   *
   * `out` and `raw` are mutually exclusive in practice. Nothing enforces it because nothing needs
   * both, and a rule with no caller is a rule that rots.
   */
  readonly raw?: string;
  /** Lines for stderr — what went wrong, or what a person should do next. */
  readonly err?: readonly string[];
}

export const ok = (out: readonly string[] = []): CommandResult => ({ code: EXIT.OK, out });

export const answeredNo = (err: readonly string[], out: readonly string[] = []): CommandResult => ({
  code: EXIT.ANSWERED_NO,
  out,
  err,
});

export const cannotAnswer = (err: readonly string[]): CommandResult => ({
  code: EXIT.CANNOT_ANSWER,
  err,
});
