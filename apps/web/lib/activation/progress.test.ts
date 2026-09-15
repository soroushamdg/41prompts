import { describe, expect, it } from "vitest";
import type { SuiteRunRow } from "@41prompts/db";
import {
  ACTIVATION_BUDGET_SECONDS,
  activationDone,
  activationSteps,
  runFacts,
  secondsFromSignup,
} from "./progress";

const NONE = { hasExample: false, hasRun: false, sawFailure: false, passed: false };

describe("activationSteps", () => {
  it("has four steps, in the order a person meets them", () => {
    expect(activationSteps(NONE).map((step) => step.key)).toEqual(["example", "run", "failure", "pass"]);
  });

  it("ticks nothing before anything has happened", () => {
    expect(activationDone(activationSteps(NONE))).toBe(0);
  });

  it("follows the rows rather than a stored position", () => {
    expect(activationDone(activationSteps({ ...NONE, hasExample: true }))).toBe(1);
    expect(activationDone(activationSteps({ ...NONE, hasExample: true, hasRun: true }))).toBe(2);
    expect(activationDone(activationSteps({ hasExample: true, hasRun: true, sawFailure: true, passed: false }))).toBe(3);
    expect(activationDone(activationSteps({ hasExample: true, hasRun: true, sawFailure: true, passed: true }))).toBe(4);
  });

  /**
   * Derived, not sequential. Somebody whose very first run passes never saw a failure, and the
   * indicator says so rather than inventing a step they skipped. A stored counter would have had to
   * choose, and would have chosen wrong.
   */
  it("does not tick a step that did not happen just because a later one did", () => {
    const steps = activationSteps({ hasExample: true, hasRun: true, sawFailure: false, passed: true });
    expect(steps.find((step) => step.key === "failure")!.done).toBe(false);
    expect(steps.find((step) => step.key === "pass")!.done).toBe(true);
  });
});

function run(state: string): Pick<SuiteRunRow, "state"> {
  return { state } as Pick<SuiteRunRow, "state">;
}

describe("runFacts", () => {
  it("knows nothing has run", () => {
    expect(runFacts([], [])).toEqual({ hasRun: false, sawFailure: false, passed: false });
  });

  it("counts a triggered run as a run even before it finishes", () => {
    expect(runFacts([run("queued")], [false]).hasRun).toBe(true);
  });

  /**
   * EPIC-030's whole point, arriving here: a run that finished having graded nothing is not a pass.
   * `noFailures` is the input, never `state === "done"`.
   */
  it("does not call an unfinished run a pass", () => {
    expect(runFacts([run("running")], [true]).passed).toBe(false);
  });

  it("does not call a refused run a failure the user saw", () => {
    expect(runFacts([run("refused")], [false]).sawFailure).toBe(false);
  });

  it("sees a failure and a later pass as both having happened", () => {
    const facts = runFacts([run("done"), run("done")], [false, true]);
    expect(facts).toEqual({ hasRun: true, sawFailure: true, passed: true });
  });
});

describe("secondsFromSignup", () => {
  const signup = new Date("2026-09-15T10:00:00.000Z");

  it("counts whole seconds", () => {
    expect(secondsFromSignup(signup, new Date("2026-09-15T10:03:20.400Z"))).toBe(200);
  });

  it("never reports a negative, whatever a clock says", () => {
    expect(secondsFromSignup(signup, new Date("2026-09-15T09:59:00.000Z"))).toBe(0);
  });

  it("carries the roadmap's own budget next to the measurement", () => {
    expect(ACTIVATION_BUDGET_SECONDS).toBe(300);
    expect(secondsFromSignup(signup, new Date("2026-09-15T10:04:59.000Z"))).toBeLessThan(ACTIVATION_BUDGET_SECONDS);
  });
});
