// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import type { CheckKind } from "../compile/types.js";
import type { CheckParams } from "./params.js";
import type { Evidence, NotGradedReason } from "./types.js";

/**
 * The eight graders. One per kind in `CHECK_KINDS`, and no others.
 *
 * ## Determinism, in the four places it usually dies
 *
 * - **Locale.** Nothing here calls `localeCompare`, `Intl`, or a bare `toLocaleLowerCase`. Case
 *   folding uses `toLowerCase()` on ASCII-only comparisons and is otherwise avoided; `"I"` does not
 *   lowercase to `"i"` in Turkish, and a grader whose answer depends on the machine's locale is not
 *   a grader.
 * - **Unicode.** Lengths are counted in **code points**, via `[...text]`, never `.length`. The unit
 *   is carried in the evidence so the number can be reproduced.
 * - **Key order.** JSON shape compares a sorted key set, never insertion order.
 * - **Regex.** The pattern reached here only by passing `pattern-safety.ts` at derivation time.
 */

/** What a grader can conclude. `not_graded` here means "known kind, still not decidable". */
export type GraderVerdict =
  | { readonly outcome: "pass"; readonly evidence: Evidence }
  | { readonly outcome: "fail"; readonly evidence: Evidence }
  | { readonly outcome: "not_graded"; readonly reason: NotGradedReason };

export type Grader = (params: CheckParams, output: string) => GraderVerdict;

/** Code points, not UTF-16 code units. `"👩‍💻"` is 3 here and 5 to `.length`. */
export function countCharacters(text: string): number {
  return [...text].length;
}

/**
 * Runs of non-whitespace.
 *
 * Deliberately **not** `Intl.Segmenter`: it is locale- and ICU-version-dependent, so the same output
 * could be 79 words on one Node build and 80 on another. A crude rule that is the same everywhere
 * beats a clever one that is not, and the evidence names the unit so nobody has to guess which was
 * used.
 */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/u).length;
}

/** Code-point offset of a substring, for evidence that points at the output rather than describing it. */
function excerptAt(output: string, needle: string): Evidence {
  const index = output.indexOf(needle);
  const start = countCharacters(output.slice(0, index));
  return { kind: "excerpt", text: needle, start, end: start + countCharacters(needle) };
}

const jsonShape: Grader = (params, output) => {
  if (params.kind !== "json_shape") throw new Error("wrong params");
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    return { outcome: "fail", evidence: { kind: "shape", expected: params.expectedKeys, found: [] } };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { outcome: "fail", evidence: { kind: "shape", expected: params.expectedKeys, found: [] } };
  }
  // Sorted, so the comparison cannot depend on the order the keys happened to be written in.
  const found = Object.keys(parsed).sort();
  const expected = [...params.expectedKeys].sort();
  const missing = expected.filter((key) => !found.includes(key));
  return missing.length === 0
    ? { outcome: "pass", evidence: { kind: "shape", expected, found } }
    : { outcome: "fail", evidence: { kind: "shape", expected, found } };
};

const allowedValues: Grader = (params, output) => {
  if (params.kind !== "allowed_values") throw new Error("wrong params");
  const actual = output.trim();
  const hit = params.values.find((value) => value === actual || value.toLowerCase() === actual.toLowerCase());
  return hit === undefined
    ? { outcome: "fail", evidence: { kind: "absent", sought: params.values.join(", ") } }
    : { outcome: "pass", evidence: excerptAt(output, actual) };
};

const wordLimit: Grader = (params, output) => {
  if (params.kind !== "word_limit") throw new Error("wrong params");
  const measured = countWords(output);
  const evidence: Evidence = { kind: "measurement", measured, limit: params.limit, counting: "words" };
  return measured <= params.limit ? { outcome: "pass", evidence } : { outcome: "fail", evidence };
};

const characterLimit: Grader = (params, output) => {
  if (params.kind !== "character_limit") throw new Error("wrong params");
  const measured = countCharacters(output);
  const evidence: Evidence = { kind: "measurement", measured, limit: params.limit, counting: "characters" };
  return measured <= params.limit ? { outcome: "pass", evidence } : { outcome: "fail", evidence };
};

const mustContain: Grader = (params, output) => {
  if (params.kind !== "must_contain") throw new Error("wrong params");
  return output.includes(params.needle)
    ? { outcome: "pass", evidence: excerptAt(output, params.needle) }
    : { outcome: "fail", evidence: { kind: "absent", sought: params.needle } };
};

const mustNotContain: Grader = (params, output) => {
  if (params.kind !== "must_not_contain") throw new Error("wrong params");
  // The failing case is the one with something to show: the forbidden text, and where it is.
  return output.includes(params.needle)
    ? { outcome: "fail", evidence: excerptAt(output, params.needle) }
    : { outcome: "pass", evidence: { kind: "absent", sought: params.needle } };
};

const matchesPattern: Grader = (params, output) => {
  if (params.kind !== "matches_pattern") throw new Error("wrong params");
  // Safe by construction: `paramsFor` refuses to build these params for a pattern the filter
  // rejected, so nothing that reaches here was allowed to be catastrophic.
  const match = new RegExp(params.pattern, params.flags).exec(output);
  return match === null
    ? { outcome: "fail", evidence: { kind: "absent", sought: params.pattern } }
    : { outcome: "pass", evidence: excerptAt(output, match[0]) };
};

/**
 * `refuses_to_answer` — the one of the eight that is not a decidable fact.
 *
 * **Never graded here, by ruling (2026-09-14).** Recognising a refusal is a judgement: "I can't help
 * with that", a polite deflection, a refusal in another language, or a sentence that merely contains
 * "I cannot" while answering perfectly well. Any deterministic version is a phrase list, and a phrase
 * list fires on any prompt containing "I cannot" — false positives are exactly what EPIC-012a spent
 * an epic avoiding, and a grader that reports `pass` for the refusals it recognised and `fail` for
 * the ones it did not is a guess dressed as an answer.
 *
 * So it is `not_graded` with `needs_judgement`, and EPIC-033's pinned judge is what it waits for.
 * The kind stays in the eight because ADR-003 fixes the set; what changes is who answers it.
 */
const refusesToAnswer: Grader = () => ({ outcome: "not_graded", reason: "needs_judgement" });

/**
 * All eight, keyed by kind.
 *
 * `Record<CheckKind, Grader>` is the guard: a ninth `CheckKind` fails to compile here until it has a
 * grader, and `CHECK_KINDS`'s own exhaustiveness construction fails separately until it is listed.
 * Two places, both compile-time. `graders.test.ts` also asserts the runtime keys equal `CHECK_KINDS`,
 * so the table cannot drift from the list either.
 */
export const GRADERS: Readonly<Record<CheckKind, Grader>> = {
  json_shape: jsonShape,
  allowed_values: allowedValues,
  word_limit: wordLimit,
  character_limit: characterLimit,
  must_contain: mustContain,
  must_not_contain: mustNotContain,
  matches_pattern: matchesPattern,
  refuses_to_answer: refusesToAnswer
};
