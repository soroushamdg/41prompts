// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * A paragraph whose trimmed length exceeds this is split at sentence boundaries; a paragraph at
 * or under it is never split, however many sentences it holds (rule 6).
 *
 * 190 characters comes from the decompiler prototype (`docs/design/41prompts-decompiler.html`),
 * which is the spec for the rules it implements. It sits a little above a long single
 * instruction and a little below the point where a paragraph is carrying more than one idea —
 * which is exactly the judgement a later epic's detectors want to make, on segments this rule
 * hands them already separated.
 */
export const SENTENCE_SPLIT_THRESHOLD = 190;

/**
 * How many top-level markers a paragraph needs before it is treated as a list rather than as
 * prose that happens to contain a dash (rule 5). Also from the prototype.
 */
export const LIST_MIN_ITEMS = 2;
