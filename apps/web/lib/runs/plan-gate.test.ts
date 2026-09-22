import type { PlanUsage } from "@41prompts/db";
import { describe, expect, it } from "vitest";
import { periodResetWords, planTitle, runLimitWords } from "./plan-gate";

/**
 * The refusal, as a pure function over a usage shape.
 *
 * Pure rather than database-backed on purpose: the property under test is **what the sentence
 * says**, and a test that needs Postgres to read a sentence is one that skips on a machine without
 * it — which is where the wording is most likely to be edited. `packages/db/src/billing.test.ts`
 * covers the derivation; this covers what a person reads.
 */

function usage(over: Partial<PlanUsage> & { runsUsed: number; limit: number; key?: string }): PlanUsage {
  const limit = over.limit;
  return {
    plan: {
      key: over.key ?? "free",
      stripePriceId: null,
      monthlyRunLimit: limit,
      monthlyCapCents: 500,
    },
    period: { start: new Date("2026-09-01T00:00:00Z"), end: new Date("2026-10-01T00:00:00Z"), fromSubscription: false },
    runsUsed: over.runsUsed,
    runsRemaining: Math.max(0, limit - over.runsUsed),
    overRunLimit: over.runsUsed >= limit,
    subscription: undefined,
  };
}

describe("a run under the limit is not refused", () => {
  it("says nothing at zero", () => {
    expect(runLimitWords(usage({ runsUsed: 0, limit: 50 }))).toBeUndefined();
  });

  it("says nothing on the last available run", () => {
    // The boundary that matters: 49 used of 50 leaves exactly one, and it is allowed.
    expect(runLimitWords(usage({ runsUsed: 49, limit: 50 }))).toBeUndefined();
  });
});

describe("a run over the limit is refused in words that name the plan and the number", () => {
  const words = runLimitWords(usage({ runsUsed: 50, limit: 50 }));

  it("refuses at exactly the limit", () => {
    expect(words).toBeDefined();
  });

  it("names the count", () => {
    expect(words).toContain("all 50 runs");
  });

  it("names the plan by the word a person reads, not the key", () => {
    expect(words).toContain("Free plan");
    expect(words).not.toContain("free plan");
  });

  it("says when it starts again", () => {
    expect(words).toContain("1 October");
  });

  it("names the Pro plan when that is the plan", () => {
    expect(runLimitWords(usage({ runsUsed: 5000, limit: 5000, key: "pro" }))).toContain("Pro plan");
  });

  it("does not say 'over budget', which is the other limit's sentence", () => {
    // The two limits are different situations with different fixes. `run_budgets`' cents cap is
    // refused by the worker; conflating the two is how somebody tries to fix the wrong thing.
    expect(words).not.toMatch(/budget/i);
    expect(words).not.toMatch(/spend|cents|\$/i);
  });
});

describe("an action that starts several runs is measured against all of them", () => {
  it("refuses three runs when two are left, and does not claim they have none", () => {
    const words = runLimitWords(usage({ runsUsed: 48, limit: 50 }), 3);
    expect(words).toContain("starts 3 runs");
    expect(words).toContain("2 left");
    // The thing this sentence exists to avoid: telling somebody they have used all of them on a
    // page that has just shown them a number greater than zero.
    expect(words).not.toContain("all 50");
  });

  it("allows three runs when exactly three are left", () => {
    expect(runLimitWords(usage({ runsUsed: 47, limit: 50 }), 3)).toBeUndefined();
  });

  it("says 'none' rather than '0 left' when there are none", () => {
    expect(runLimitWords(usage({ runsUsed: 50, limit: 50 }), 3)).toContain("you have none left");
  });
});

describe("the small pieces", () => {
  it("titles the three plans and passes an unknown key through", () => {
    expect(planTitle("free")).toBe("Free");
    expect(planTitle("pro")).toBe("Pro");
    expect(planTitle("team")).toBe("Team");
    expect(planTitle("something-else")).toBe("something-else");
  });

  it("reads the reset date in UTC, not the reader's zone", () => {
    // A period ending at midnight UTC is the 1st. In any zone west of Greenwich a local-time
    // render would say the 30th — and that is exactly the day somebody is reading this sentence.
    expect(periodResetWords(new Date("2026-10-01T00:00:00Z"))).toBe("1 October");
  });

  it("uses the singular for a one-run plan", () => {
    expect(runLimitWords(usage({ runsUsed: 1, limit: 1 }))).toContain("all 1 run on");
  });
});
