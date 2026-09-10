// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * How many words a single blok may carry before it is doing more than one job.
 *
 * From the decompiler prototype, which flagged a blok over 55 words as "carries more than one
 * instruction". Exported and revisitable: EPIC-084 will have the real distribution of blok sizes
 * from live traffic, and this is a guess until then.
 */
export const MAX_BLOK_WORDS = 55;

/**
 * How many words a whole prompt may carry before its length is itself worth mentioning.
 *
 * Deliberately generous. A long prompt is not a defect — plenty of good prompts are long — so this
 * fires only where length has plainly stopped being deliberate. Same caveat: a guess until EPIC-084.
 */
export const MAX_PROMPT_WORDS = 1_200;

/**
 * How much of the smaller blok's vocabulary two bloks must share before `repeated` will say they are
 * the same instruction.
 *
 * The same measure and threshold clustering uses (decision 6), re-exported here so the relationship
 * is visible: anything at or above this that also shares a kind was *already merged* into one blok,
 * so what `repeated` actually reports is the pair clustering refused.
 */
export { MERGE_OVERLAP_THRESHOLD as REPEAT_OVERLAP_THRESHOLD } from "../cluster/similarity.js";

/**
 * How many `rule_without_check` findings one prompt may produce.
 *
 * Three, and the number matters more here than anywhere else in this module. Measured on the 25
 * EPIC-010 fixtures, **not one contains an `expected` blok** — so "nothing checks this rule" is true
 * of every rule in every real prompt, and an uncapped detector reports sixty findings on the corpus
 * and turns the panel into a wall. Three is enough to show the reader the gap is systemic and few
 * enough that the rest of the panel is still readable.
 *
 * It binds on exactly one of the 25 fixtures today (support-email-router: five candidates, three
 * shown), which is the behaviour intended — a guard against the wall-of-rules prompt, not a routine
 * truncation. Exported and revisitable once EPIC-084 has the real distribution.
 */
export const MAX_RULES_WITHOUT_CHECKS = 3;
