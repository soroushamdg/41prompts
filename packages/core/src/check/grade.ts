// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { Check } from "../compile/types.js";
import { GRADERS } from "./graders.js";
import { paramsFor } from "./params.js";
import type { CheckResult, RunSummary } from "./types.js";

/**
 * Grade one check against one model output.
 *
 * **Two values in, one value out.** No options bag, no clock, no injected services, no IO — each of
 * those is a way for the same inputs to answer differently later, and this function's whole contract
 * is that they cannot. `packages/core` declares zero dependencies and dependency-cruiser fails the
 * build on anything else, so "pure" here is enforced rather than promised.
 *
 * The three outcomes are in `types.ts`, and the one worth re-reading is `not_graded`: it is not a
 * failure, and it never becomes one.
 */
export function grade(check: Check, output: string): CheckResult {
  const base = { checkId: check.id, blokId: check.blokId } as const;

  // No shape matched the rule, so none of the eight can honestly be named. `checkKindFor` already
  // refused to guess; this refuses to invent a ninth.
  if (check.kind === undefined) {
    return { ...base, outcome: "not_graded", reason: "no_kind" };
  }

  const params = paramsFor(check.kind, check.text);
  if (params === undefined) {
    // Either the text carries no usable parameter, or — for `matches_pattern` — the filter refused
    // the pattern. Both are our limitation rather than the author's error, and neither fails a
    // prompt. The two are told apart so the reason can be shown rather than summarised.
    const reason = check.kind === "matches_pattern" ? "pattern_rejected" : "params_not_derivable";
    return { ...base, kind: check.kind, outcome: "not_graded", reason };
  }

  const verdict = GRADERS[check.kind](params, output);
  return verdict.outcome === "not_graded"
    ? { ...base, kind: check.kind, outcome: "not_graded", reason: verdict.reason }
    : { ...base, kind: check.kind, outcome: verdict.outcome, evidence: verdict.evidence };
}

/** Grade a whole set. Order in, order out — the caller's order is the only one there is. */
export function gradeAll(checks: readonly Check[], output: string): readonly CheckResult[] {
  return checks.map((check) => grade(check, output));
}

/**
 * Roll a set of results up, without collapsing the two questions into one.
 *
 * **There is deliberately no `passed` field.** "Did this pass?" has two honest answers when nothing
 * could be graded, and a single boolean would have to pick one — either calling an unverified prompt
 * a pass, or failing it for being simple. See `RunSummary` for which of the two booleans gates Live
 * and which one owes the user a sentence.
 */
export function summarise(results: readonly CheckResult[]): RunSummary {
  const passed = results.filter((result) => result.outcome === "pass").length;
  const failed = results.filter((result) => result.outcome === "fail").length;
  const notGraded = results.filter((result) => result.outcome === "not_graded").length;

  return {
    total: results.length,
    passed,
    failed,
    notGraded,
    noFailures: failed === 0,
    // `total > 0` matters: a prompt with no checks at all has verified nothing, and must not report
    // itself as fully checked on the strength of an empty list.
    fullyChecked: results.length > 0 && passed === results.length
  };
}
