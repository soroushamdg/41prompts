import type { SuiteRunRow } from "@41prompts/db";

/**
 * The four steps of the activation journey, **derived from rows that already exist**.
 *
 * ## Why nothing is stored
 *
 * Every step is answerable by asking the database a question it can already answer: does the prompt
 * exist, has it been run, did a run finish with a failure, did one finish with none. A stored flag
 * would be a second source of truth about something that already has one — and when the two
 * disagree, it is always the flag that is wrong, because the rows are what actually happened.
 *
 * It also means the indicator is correct for a person who arrives halfway through, closes the tab,
 * or comes back tomorrow. There is no state machine to resume, because there is no state machine.
 *
 * ## Why "make it pass" is not "the run finished"
 *
 * EPIC-030 removed `passed` from `RunSummary` so that no caller could read one boolean as the
 * answer. A run that finished having graded nothing is not a pass, and a step that ticked on it
 * would be the exact fudge that field was deleted to prevent. The caller passes `noFailures` from
 * `summarise`, not `state === "done"`.
 */
export interface ActivationStep {
  readonly key: "example" | "run" | "failure" | "pass";
  /**
   * The step's words. Called `title` and not `label`: ADR-003 forbids that word in UI strings,
   * schema and code identifiers alike, and `pnpm forbidden-words` fails the build on it — which is
   * how this one was caught rather than shipped.
   */
  readonly title: string;
  readonly done: boolean;
}

export interface ActivationState {
  /** The example prompt exists and belongs to this person. */
  readonly hasExample: boolean;
  /** Any run at all has been triggered on it. */
  readonly hasRun: boolean;
  /** A run finished and something failed — the thing this product exists to show them. */
  readonly sawFailure: boolean;
  /** A run finished with no failures at all. */
  readonly passed: boolean;
}

export function activationSteps(state: ActivationState): readonly ActivationStep[] {
  return [
    { key: "example", title: "Start from an example", done: state.hasExample },
    { key: "run", title: "Run it against the inputs", done: state.hasRun },
    { key: "failure", title: "See which rule failed", done: state.sawFailure },
    { key: "pass", title: "Fix it and make it pass", done: state.passed },
  ];
}

/** How far along, for the indicator's own summary line. */
export function activationDone(steps: readonly ActivationStep[]): number {
  return steps.filter((step) => step.done).length;
}

/**
 * Read the two run-shaped facts off a prompt's run history.
 *
 * `noFailures` cannot be read from a `suite_runs` row — the row counts inputs and money, not
 * verdicts — so the caller supplies it per run from the stored results. Passing it in rather than
 * fetching it here keeps this module pure and testable without a database.
 */
export function runFacts(
  runs: readonly Pick<SuiteRunRow, "state">[],
  noFailuresByIndex: readonly boolean[]
): Pick<ActivationState, "hasRun" | "sawFailure" | "passed"> {
  const finished = runs.map((run, index) => ({ run, noFailures: noFailuresByIndex[index] ?? false }));
  return {
    hasRun: runs.length > 0,
    sawFailure: finished.some(({ run, noFailures }) => run.state === "done" && !noFailures),
    passed: finished.some(({ run, noFailures }) => run.state === "done" && noFailures),
  };
}

/**
 * Whole seconds from signup to now.
 *
 * The roadmap defines "activated" as a first passing run **within five minutes of signup**, so the
 * number that matters is this one and it is computed from `users.createdAt` rather than from
 * anything the client could be wrong about. Floored, and never negative: a clock that disagrees
 * with itself should not produce a record claiming somebody activated before they signed up.
 */
export function secondsFromSignup(signedUpAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - signedUpAt.getTime()) / 1000));
}

/** The roadmap's own number, so the definition lives next to the measurement. */
export const ACTIVATION_BUDGET_SECONDS = 5 * 60;
