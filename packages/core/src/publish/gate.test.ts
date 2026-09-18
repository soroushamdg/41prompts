// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { publishGate } from "./gate.js";
import type { ChecksState, GateReport, GateRow, GateRowKind, PublishGateInput } from "./types.js";

const MODEL = "claude-sonnet-5";

const proved = (passed: number, graded: number, notGraded = 0): ChecksState => ({
  kind: "proved",
  model: MODEL,
  suiteRunId: "sr_0001",
  passed,
  graded,
  notGraded,
});

/** Everything green, so each test can move exactly one fact and see it in the verdict. */
function input(over: Partial<PublishGateInput> = {}): PublishGateInput {
  return {
    targetModel: MODEL,
    checks: proved(6, 6),
    compatibility: { compatible: true, breaks: [] },
    cost: { liveCentsPerCall: 100, nextCentsPerCall: 100 },
    diff: { added: 0, removed: 0, changed: 0, moved: 0 },
    ...over,
  };
}

const row = (report: GateReport, kind: GateRowKind): GateRow => {
  const found = report.rows.find((candidate) => candidate.kind === kind);
  if (found === undefined) throw new Error(`no ${kind} row`);
  return found;
};

describe("publishGate — shape", () => {
  it("returns the four rows the Deploy page shows, in the mockup's order", () => {
    expect(publishGate(input()).rows.map((each) => each.kind)).toEqual(["checks", "contract", "cost", "diff"]);
  });

  it("marks exactly the two rows that block", () => {
    const blocking = publishGate(input())
      .rows.filter((each) => each.blocking)
      .map((each) => each.kind);
    expect(blocking).toEqual(["checks", "contract"]);
  });

  it("passes everything when every fact is good", () => {
    const report = publishGate(input());
    expect(report.blocked).toBe(false);
    expect(row(report, "checks").verdict).toBe("pass");
    expect(row(report, "contract").verdict).toBe("pass");
  });
});

// ── C1 and C3: the three states of "did the checks pass", kept apart ──────────────────────────────

describe("publishGate — checks", () => {
  it("passes a prompt with no checks: there is nothing to prove", () => {
    const report = publishGate(input({ checks: { kind: "no_checks" } }));
    expect(report.blocked).toBe(false);
    expect(row(report, "checks").reason).toBe("nothing_to_prove");
  });

  it("blocks when the checks failed on the target model", () => {
    const report = publishGate(input({ checks: proved(5, 6) }));
    expect(report.blocked).toBe(true);
    expect(row(report, "checks").reason).toBe("checks_failed");
  });

  // C3. The distinction this test exists for: "we ran it and it failed" and "nobody ever ran it"
  // must not produce the same row, or the gate is satisfiable by not testing.
  it("blocks when the checks were never run on the target model, with its own reason", () => {
    const never = publishGate(input({ checks: { kind: "not_proved", model: MODEL } }));
    const failed = publishGate(input({ checks: proved(5, 6) }));

    expect(never.blocked).toBe(true);
    expect(row(never, "checks").reason).toBe("not_proved_on_target_model");
    expect(row(never, "checks").reason).not.toBe(row(failed, "checks").reason);
  });

  it("blocks when everything ran and nothing could be graded", () => {
    const report = publishGate(input({ checks: proved(0, 0, 6) }));
    expect(report.blocked).toBe(true);
    expect(row(report, "checks").reason).toBe("nothing_could_be_graded");
  });

  it("passes when every graded check passed, and keeps the ungraded count visible", () => {
    const report = publishGate(input({ checks: proved(4, 4, 2) }));
    expect(report.blocked).toBe(false);
    expect(row(report, "checks").reason).toBe("checks_passed");
    // Not folded away: "four passed and two nobody could grade" is not "six passed" (EPIC-030).
    expect(row(report, "checks").detail).toEqual({ of: "checks", state: proved(4, 4, 2) });
  });

  it("never reports a pass rate of its own — the counts are carried, not averaged", () => {
    const detail = row(publishGate(input({ checks: proved(3, 6, 1) })), "checks").detail;
    expect(detail).toEqual({ of: "checks", state: proved(3, 6, 1) });
  });
});

// ── C1: the contract row ─────────────────────────────────────────────────────────────────────────

describe("publishGate — contract", () => {
  it("passes when nothing is Live: there are no callers in the field to break", () => {
    const report = publishGate(input({ compatibility: null }));
    expect(report.blocked).toBe(false);
    expect(row(report, "contract").reason).toBe("no_live_callers");
  });

  it("blocks on any break, and carries every one of them", () => {
    const breaks = [
      { kind: "added_required", name: "locale" },
      { kind: "removed", name: "email" },
    ] as const;
    const report = publishGate(input({ compatibility: { compatible: false, breaks } }));

    expect(report.blocked).toBe(true);
    expect(row(report, "contract").reason).toBe("contract_broken");
    // The gate says *which*, so EPIC-055 can name the variable rather than the word "incompatible".
    expect(row(report, "contract").detail).toEqual({ of: "contract", breaks });
  });

  it("blocks on a contract break even when every check passed", () => {
    const report = publishGate(
      input({
        checks: proved(6, 6),
        compatibility: { compatible: false, breaks: [{ kind: "became_required", name: "tone" }] },
      }),
    );
    expect(report.blocked).toBe(true);
    expect(row(report, "checks").verdict).toBe("pass");
  });
});

// ── C2: the two rows that report and never block ─────────────────────────────────────────────────

describe("publishGate — cost and diff never block", () => {
  it("reports a cost increase as drift, and does not block", () => {
    const report = publishGate(input({ cost: { liveCentsPerCall: 100, nextCentsPerCall: 200 } }));
    expect(report.blocked).toBe(false);
    expect(row(report, "cost").verdict).toBe("drift");
    expect(row(report, "cost").detail).toEqual({
      of: "cost",
      comparison: { liveCentsPerCall: 100, nextCentsPerCall: 200 },
      deltaRatio: 1,
    });
  });

  it("does not block on a cost increase of any size", () => {
    const report = publishGate(input({ cost: { liveCentsPerCall: 1, nextCentsPerCall: 1_000_000 } }));
    expect(report.blocked).toBe(false);
    expect(row(report, "cost").blocking).toBe(false);
  });

  it("calls an unchanged cost a pass rather than drift", () => {
    expect(row(publishGate(input()), "cost").reason).toBe("cost_unchanged");
  });

  it("reports an unknown cost as unknown, never as zero", () => {
    const detail = row(publishGate(input({ cost: null })), "cost").detail;
    expect(detail).toEqual({ of: "cost", comparison: null, deltaRatio: null });
  });

  it("gives no ratio when the Live build cost nothing measurable", () => {
    const report = publishGate(input({ cost: { liveCentsPerCall: 0, nextCentsPerCall: 7 } }));
    expect(row(report, "cost").verdict).toBe("drift");
    expect(row(report, "cost").detail).toEqual({
      of: "cost",
      comparison: { liveCentsPerCall: 0, nextCentsPerCall: 7 },
      // Not Infinity, which renders.
      deltaRatio: null,
    });
  });

  it("reports the blok diff and never blocks on it", () => {
    const counts = { added: 1, removed: 1, changed: 0, moved: 1 };
    const report = publishGate(input({ diff: counts }));
    expect(report.blocked).toBe(false);
    expect(row(report, "diff").verdict).toBe("info");
    expect(row(report, "diff").detail).toEqual({ of: "diff", counts });
  });

  it("says there is nothing to compare against when nothing is Live", () => {
    expect(row(publishGate(input({ diff: null })), "diff").reason).toBe("no_live_to_compare");
  });
});

// ── The property the whole thing rests on ────────────────────────────────────────────────────────

describe("publishGate — blocked follows the blocking rows and nothing else", () => {
  it("is blocked if and only if a blocking row failed", () => {
    const cases: PublishGateInput[] = [
      input(),
      input({ checks: { kind: "no_checks" } }),
      input({ checks: { kind: "not_proved", model: MODEL } }),
      input({ checks: proved(0, 6) }),
      input({ checks: proved(0, 0, 3) }),
      input({ compatibility: null }),
      input({ compatibility: { compatible: false, breaks: [{ kind: "type_changed", name: "n" }] } }),
      input({ cost: null }),
      input({ cost: { liveCentsPerCall: 3, nextCentsPerCall: 9_999 } }),
      input({ diff: null }),
    ];

    for (const candidate of cases) {
      const report = publishGate(candidate);
      const failedBlocking = report.rows.some((each) => each.blocking && each.verdict === "fail");
      expect(report.blocked).toBe(failedBlocking);
    }
  });

  // The positive control for the assertion above: it would be satisfied by a `blocked` that is
  // always false if no case in the list ever blocked. Two of them must.
  it("the matrix above contains both outcomes", () => {
    expect(publishGate(input()).blocked).toBe(false);
    expect(publishGate(input({ checks: proved(0, 6) })).blocked).toBe(true);
  });

  it("no non-blocking row can change the outcome", () => {
    const base = input({ checks: proved(1, 6) });
    const quiet = publishGate(base).blocked;
    expect(publishGate({ ...base, cost: null }).blocked).toBe(quiet);
    expect(publishGate({ ...base, cost: { liveCentsPerCall: 1, nextCentsPerCall: 9 } }).blocked).toBe(quiet);
    expect(publishGate({ ...base, diff: null }).blocked).toBe(quiet);
  });
});
