// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ContractBreak } from "../artifact/compatibility.js";

/**
 * The four things a person is told before a prompt goes Live (EPIC-051).
 *
 * The mockup's Deploy page shows exactly these four rows, in this order, and two of them are the
 * reason the product can say *"it cannot go live if it breaks your tests"*:
 *
 * - **`checks`** — did this version's checks pass on the model it is being published against.
 * - **`contract`** — does publishing it break the callers that are already in the field.
 * - **`cost`** — what a call costs now versus what it cost before.
 * - **`diff`** — what changed, as a count of bloks.
 *
 * `cost` and `diff` are **information, not permission.** A prompt that costs 4% more is not a
 * prompt that is wrong, and a gate that refuses one teaches people to go around gates.
 */
export type GateRowKind = "checks" | "contract" | "cost" | "diff";

/**
 * What a row says.
 *
 * `CLAUDE.md` rule 10: green, red and amber mean pass, fail and drift, and nothing else may use
 * them. These are the same three words plus `info` — a row that is neither good news nor bad news
 * nor a movement, which is what the blok diff is.
 *
 * **A verdict is not a colour.** Rule 10's second sentence — pass/fail is never shown by colour
 * alone — is `apps/web`'s to keep; this type exists so that there is one word to key it off.
 */
export type GateVerdict = "pass" | "fail" | "drift" | "info";

/**
 * Why a row says what it says — **a code, never a sentence.**
 *
 * The same split `CheckKind` and `CHECK_KIND_PHRASES` already make. Core decides; `apps/web` writes
 * the words. Two reasons, and the second is the one that bites: a sentence in a zero-dependency
 * package cannot be translated, and ADR-003's forbidden-word grep runs over `apps/web`'s strings —
 * a phrase that lives here is a phrase outside the thing that checks the vocabulary.
 */
export type GateReason =
  // checks
  | "nothing_to_prove"
  | "not_proved_on_target_model"
  | "nothing_could_be_graded"
  | "checks_failed"
  | "checks_passed"
  // contract
  | "no_live_callers"
  | "contract_compatible"
  | "contract_broken"
  // cost
  | "cost_unknown"
  | "cost_unchanged"
  | "cost_moved"
  // diff
  | "no_live_to_compare"
  | "blok_diff";

/**
 * What is known about this version's checks, **as three distinguishable facts**.
 *
 * A discriminated union rather than four numbers, and that is criterion C3 rather than taste. The
 * three states below are different claims:
 *
 * - `no_checks` — this prompt asserts nothing, so there is nothing to prove. Normal, not an
 *   exception: `Artifact.checkSuiteId` is `null` for exactly this case and EPIC-050's schema says so.
 * - `not_proved` — it asserts things and **nobody has run them on this model**. Unknown.
 * - `proved` — they were run, and here is what happened.
 *
 * Any encoding that lets the first two both be written as *"0 of 0 passed"* is an encoding in which
 * a gate can be satisfied by never testing. That is the failure this shape exists to make
 * unrepresentable.
 */
export type ChecksState =
  | { readonly kind: "no_checks" }
  | { readonly kind: "not_proved"; readonly model: string }
  | {
      readonly kind: "proved";
      readonly model: string;
      readonly suiteRunId: string;
      readonly passed: number;
      /** `pass` + `fail`. **Excludes `not_graded`**, exactly as `VersionPassRate.graded` does. */
      readonly graded: number;
      /** Results nobody could grade. EPIC-030's third outcome, never folded into the other two. */
      readonly notGraded: number;
    };

/** Cents per call, on each side. Null when either side is unknown — an unmeasured cost is not zero. */
export interface CostComparison {
  readonly liveCentsPerCall: number;
  readonly nextCentsPerCall: number;
}

/** How many bloks moved between what is Live and what is being published. */
export interface BlokDiffCounts {
  readonly added: number;
  readonly removed: number;
  readonly changed: number;
  readonly moved: number;
}

/** Everything the gate is allowed to know. No database, no clock, no network. */
export interface PublishGateInput {
  /** The pinned model id the checks were to be proved against (`CLAUDE.md` rule 9's "target model"). */
  readonly targetModel: string;
  readonly checks: ChecksState;
  /**
   * `isCompatible(live, next)`, or **null when nothing is Live** — there are then no callers in the
   * field, so there is nobody for this publish to break.
   */
  readonly compatibility: { readonly compatible: boolean; readonly breaks: readonly ContractBreak[] } | null;
  readonly cost: CostComparison | null;
  readonly diff: BlokDiffCounts | null;
}

/** The facts behind one row, for a surface that wants to say more than the reason code. */
export type GateDetail =
  | { readonly of: "checks"; readonly state: ChecksState }
  | { readonly of: "contract"; readonly breaks: readonly ContractBreak[] }
  | { readonly of: "cost"; readonly comparison: CostComparison | null; readonly deltaRatio: number | null }
  | { readonly of: "diff"; readonly counts: BlokDiffCounts | null };

export interface GateRow {
  readonly kind: GateRowKind;
  readonly verdict: GateVerdict;
  readonly reason: GateReason;
  /**
   * Whether a `fail` on this row stops the publish.
   *
   * True for `checks` and `contract` and false for the other two, always — it is a property of the
   * row's kind rather than of this particular evaluation, and it is carried on the row so that a
   * reader of one row knows what it costs without having to know the rule.
   */
  readonly blocking: boolean;
  readonly detail: GateDetail;
}

export interface GateReport {
  readonly rows: readonly GateRow[];
  /** True when any blocking row failed. "Publish anyway" is the only way past it (`CLAUDE.md` rule 9). */
  readonly blocked: boolean;
}
