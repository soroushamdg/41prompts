// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type {
  BlokDiffCounts,
  ChecksState,
  CostComparison,
  GateReport,
  GateRow,
  PublishGateInput,
} from "./types.js";

/**
 * May this version go Live? (EPIC-051)
 *
 * **This is the one decision in the product that must be correct**, which is why it is here and not
 * in `apps/web`: `CLAUDE.md` rule 1 puts logic that must be correct in `packages/core` with tests,
 * and rule 9 says publishing to Live is blocked when checks fail on the target model.
 *
 * ## It answers, it does not act
 *
 * Nothing here writes, throws, reads a clock or asks a database. It takes facts and returns a
 * verdict, so the same verdict can be computed by a route about to publish, by a page showing what
 * would happen, and by a test — without any of the three being able to disagree with the others.
 *
 * ## Two rows block and two do not
 *
 * `checks` and `contract` block. `cost` and `diff` never do, at any value.
 *
 * That is a product decision rather than an omission. A publish that costs 4% more is not a publish
 * that is wrong — it is a fact somebody should see. A gate that refuses it teaches people that
 * gates are obstacles to be worked around, and then the two gates that matter are worked around
 * too. The mockup agrees: its cost row is amber and its diff row is a Δ, while the two that carry a
 * ✕ are the two here that block.
 *
 * ## "Publish anyway" is not modelled here
 *
 * `blocked` is a fact about the version, not about what a person is allowed to do. Rule 9's escape —
 * a typed reason, attributed and audited — is the caller's, and the caller records *this report* as
 * what it went past. A gate that could be told to pass would be a gate with no fixed meaning, and
 * the audit row would then say a publish satisfied something it did not.
 */
export function publishGate(input: PublishGateInput): GateReport {
  const rows: GateRow[] = [checksRow(input.checks), contractRow(input), costRow(input.cost), diffRow(input.diff)];
  return { rows, blocked: rows.some((row) => row.blocking && row.verdict === "fail") };
}

function checksRow(state: ChecksState): GateRow {
  const blocking = true;
  const detail = { of: "checks", state } as const;

  // Nothing to prove. A prompt need not assert anything, and publishing one that does not is not an
  // exception being made — `Artifact.checkSuiteId` is `null` for precisely this case (EPIC-050).
  if (state.kind === "no_checks") {
    return { kind: "checks", verdict: "pass", reason: "nothing_to_prove", blocking, detail };
  }

  // Unknown, and unknown is not permission. This is the row that stops a gate from being satisfied
  // by never running the suite — the failure mode the `ChecksState` union exists to make sayable.
  if (state.kind === "not_proved") {
    return { kind: "checks", verdict: "fail", reason: "not_proved_on_target_model", blocking, detail };
  }

  // Everything ran and nothing could be graded. EPIC-030's third outcome is "nobody can tell yet",
  // and a gate cannot read that as a pass: `VersionPassRate.rate` is null rather than 0 for the same
  // reason, because 0 would read as "all failed" and 1 would be a lie.
  if (state.graded === 0) {
    return { kind: "checks", verdict: "fail", reason: "nothing_could_be_graded", blocking, detail };
  }

  if (state.passed < state.graded) {
    return { kind: "checks", verdict: "fail", reason: "checks_failed", blocking, detail };
  }

  // Some were graded, all of those passed. `notGraded` may still be non-zero and is carried in the
  // detail rather than hidden: "four checks passed and two nobody could grade" is the honest
  // sentence, and it is not the same sentence as "six checks passed".
  return { kind: "checks", verdict: "pass", reason: "checks_passed", blocking, detail };
}

function contractRow(input: PublishGateInput): GateRow {
  const blocking = true;

  // Nothing is Live, so nothing is calling this prompt, so nothing can be broken by publishing it.
  // The first publish of a prompt always passes this row and that is correct rather than lenient.
  if (input.compatibility === null) {
    return {
      kind: "contract",
      verdict: "pass",
      reason: "no_live_callers",
      blocking,
      detail: { of: "contract", breaks: [] },
    };
  }

  const { compatible, breaks } = input.compatibility;
  return {
    kind: "contract",
    verdict: compatible ? "pass" : "fail",
    reason: compatible ? "contract_compatible" : "contract_broken",
    blocking,
    detail: { of: "contract", breaks },
  };
}

function costRow(comparison: CostComparison | null): GateRow {
  const blocking = false;

  // An unmeasured cost is not a cost of zero. Reporting 0 here would render as "free", and a
  // −100% delta against a Live build that cost something would be a number somebody acts on.
  if (comparison === null) {
    return {
      kind: "cost",
      verdict: "info",
      reason: "cost_unknown",
      blocking,
      detail: { of: "cost", comparison: null, deltaRatio: null },
    };
  }

  const { liveCentsPerCall, nextCentsPerCall } = comparison;
  // A ratio needs a denominator. A Live build that cost nothing measurable — every input answered
  // from the cache, say — has no percentage to move by, and inventing Infinity would be a number
  // that renders.
  const deltaRatio = liveCentsPerCall === 0 ? null : (nextCentsPerCall - liveCentsPerCall) / liveCentsPerCall;
  const moved = nextCentsPerCall !== liveCentsPerCall;

  return {
    kind: "cost",
    // **`drift`, not `fail`.** Rule 10 gives amber exactly one meaning and this is it: a number that
    // moved. Cost never blocks; see the header.
    verdict: moved ? "drift" : "pass",
    reason: moved ? "cost_moved" : "cost_unchanged",
    blocking,
    detail: { of: "cost", comparison, deltaRatio },
  };
}

function diffRow(counts: BlokDiffCounts | null): GateRow {
  return {
    kind: "diff",
    verdict: "info",
    reason: counts === null ? "no_live_to_compare" : "blok_diff",
    blocking: false,
    detail: { of: "diff", counts },
  };
}
