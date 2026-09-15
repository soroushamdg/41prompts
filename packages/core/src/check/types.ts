// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { CheckKind } from "../compile/types.js";

/**
 * What grading one check produced.
 *
 * ## Three outcomes, and the third is not a failure
 *
 * EPIC-030 decision 3. A check can be un-gradable for reasons that are **ours, not the author's**:
 * no kind could be honestly named, params could not be derived from the text, or a pattern was
 * rejected by the filter. Folding that into `fail` blocks a publish for something nobody asserted;
 * folding it into `pass` claims evidence that does not exist.
 *
 * The parallel EPIC-012b already settled: *a rule nothing checks is a finding, not a failure.*
 * `not_graded` is that same idea arriving from the other side.
 */
export type CheckOutcome = "pass" | "fail" | "not_graded";

/**
 * Why a check could not be graded, typed so a caller can say which rather than "something".
 *
 * - `no_kind` — `checkKindFor` matched no shape, so none of the eight can honestly be named.
 * - `params_not_derivable` — the kind is known and the text does not carry what it needs.
 *   "Reply in at most 80 words" yields a limit; "reply briefly" does not.
 * - `pattern_rejected` — the filter refused the pattern. See `pattern-safety.ts`.
 * - `needs_judgement` — the kind is known and is not a decidable fact. Today that is
 *   `refuses_to_answer` and only that; EPIC-033's pinned judge is what these are waiting for.
 */
export type NotGradedReason = "no_kind" | "params_not_derivable" | "pattern_rejected" | "needs_judgement";

/**
 * What a grader found, as a fact rather than a sentence.
 *
 * **Never generated prose** (decision 5). `packages/core` does not write sentences about a person's
 * output, for the same reason the compiler never paraphrases a blok — `CLAUDE.md` rule 3. Each
 * variant is either a slice of the output with its offsets, a measurement with its unit, or the
 * statement that something looked for was not there. EPIC-032 turns these into English; core does
 * not.
 *
 * Offsets are code-point indices into the output, counted the same way everywhere in this package.
 */
export type Evidence =
  /** A slice of the output, with where it was found. */
  | { readonly kind: "excerpt"; readonly text: string; readonly start: number; readonly end: number }
  /** A count against a limit, naming what was counted so the number can be reproduced. */
  | { readonly kind: "measurement"; readonly measured: number; readonly limit: number; readonly counting: CountingUnit }
  /** Something was looked for and was not present. */
  | { readonly kind: "absent"; readonly sought: string }
  /** The output did not parse, or parsed to the wrong shape. Carries what was expected, not advice. */
  | { readonly kind: "shape"; readonly expected: readonly string[]; readonly found: readonly string[] }
  /**
   * A model was asked to judge, and this is what it said (EPIC-033).
   *
   * **The odd one out, and deliberately so.** The four above are facts anybody can re-derive from
   * the output: a slice, a count, an absence, a shape. This one is testimony — it is only as good
   * as the thing that produced it, which is why `judge` is here at all. The pinned model id travels
   * with the verdict so a result can always be traced to what produced it, and so two runs judged by
   * different versions are never silently compared (`CLAUDE.md` rule 7).
   *
   * `rationale` is the judge's own words, stored verbatim and never rewritten — the same discipline
   * rule 3 applies to a blok's source text. `packages/core` still writes no English: this is what
   * was said, and `apps/web` decides how to present it.
   */
  | { readonly kind: "judgement"; readonly rationale: string; readonly judge: string };

/**
 * What a limit counts.
 *
 * Named in the evidence rather than assumed, because both hide a definition and a measurement
 * nobody can reproduce is not evidence. `"👩‍💻"` is 5 UTF-16 code units, 3 code points and 1
 * grapheme; this package counts **code points**, and says so.
 */
export type CountingUnit = "words" | "characters";

/** One check, graded. */
export interface CheckResult {
  readonly checkId: string;
  /**
   * The blok this came from — **exactly one, always** (decision 4).
   *
   * One expected blok may produce several checks; a check never comes from several bloks and never
   * from none. That is a property of how `compile()` builds them and it is asserted rather than
   * assumed, in `grade.test.ts`.
   */
  readonly blokId: string;
  /** Absent exactly when the outcome is `not_graded` with reason `no_kind`. */
  readonly kind?: CheckKind;
  readonly outcome: CheckOutcome;
  /** Present exactly when the outcome is `not_graded`. */
  readonly reason?: NotGradedReason;
  /** Present for every `pass` and `fail`. Absent for `not_graded`, which has nothing to show. */
  readonly evidence?: Evidence;
}

/**
 * The roll-up, and the place the ambiguity actually lives.
 *
 * A per-check outcome is easy. The trap is "did this pass?", which has two different honest answers
 * when nothing could be graded — so there are **two booleans and deliberately no field called
 * `passed`**. A name that reads as the answer invites callers to use it as the answer.
 *
 * ## What each one is for, because they gate different things
 *
 * - **`noFailures`** is the publish gate. `CLAUDE.md` rule 9 blocks Live when checks *fail*, and ten
 *   ungradable checks have failed nothing — blocking there would mean refusing to publish a prompt
 *   for being simple. Soroush's ruling, 2026-09-14.
 * - **`fullyChecked`** is the honesty half, and it is **never folded into a pass**. When it is
 *   false the user is entitled to their own sentence at the publish moment saying nothing verified
 *   this. EPIC-032 owns that sentence; this field is what it reads.
 */
export interface RunSummary {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly notGraded: number;
  /** No check failed. Says nothing about how many ran. Gates Live. */
  readonly noFailures: boolean;
  /** Every check ran, and every one passed. The only field that means "this is verified". */
  readonly fullyChecked: boolean;
}
