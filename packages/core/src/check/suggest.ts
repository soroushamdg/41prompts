// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { CHECK_KIND_PHRASES, type CheckKind } from "../compile/types.js";
import type { Check } from "../compile/types.js";
import { paramsFor, type CheckParams } from "./params.js";

/**
 * What to offer for an expected blok that could not be graded.
 *
 * ## A suggested check, never a suggested rewording
 *
 * Ruled 2026-09-14, and it follows from a rule that already exists: `CLAUDE.md` rule 3 forbids the
 * compiler emitting a paraphrase of user text, and **a suggested rewording is that with extra
 * steps**. Offering "we could grade this if you said it like *this*" puts our words in the author's
 * blok and then compiles them.
 *
 * So the suggestion names a **check** — a kind, and the parameter it still needs — in the same shape
 * EPIC-012b already uses for the other side of this question ("Add a *word limit* check."). The
 * author's text is never rewritten and never quoted back as an improvement.
 */

/** A check the author could add, and what is still missing before it could run. */
export interface CheckSuggestion {
  readonly blokId: string;
  readonly checkId: string;
  /** The kind being offered, when one can be named. Absent when nothing matched. */
  readonly kind?: CheckKind;
  /** ADR-003's phrase for that kind. The identifier never reaches a screen. */
  readonly phrase?: string;
  /**
   * What the check would need that the text does not carry — "a number", "a quoted phrase". Empty
   * when the kind itself is what is missing.
   */
  readonly missing: readonly string[];
}

/** What each kind needs, in the words a person would use for it. */
const NEEDS: Readonly<Record<CheckKind, readonly string[]>> = {
  json_shape: ["the field names, quoted"],
  allowed_values: ["the allowed values, as a list of two or more"],
  word_limit: ["a number of words"],
  character_limit: ["a number of characters"],
  must_contain: ["the required text, quoted"],
  must_not_contain: ["the forbidden text, quoted"],
  matches_pattern: ["a pattern, quoted, that this can safely run"],
  // Nothing is missing. It is waiting on a judge rather than on the author, so there is nothing to
  // ask for and the suggestion engine has nothing useful to say.
  refuses_to_answer: []
};

/**
 * Suggest for the checks that did not grade.
 *
 * Returns nothing for a check that already works — a suggestion attached to something functioning is
 * noise, and EPIC-012b's report records what stacking unusable advice does to the ones that matter.
 */
export function suggestFor(checks: readonly Check[]): readonly CheckSuggestion[] {
  const suggestions: CheckSuggestion[] = [];

  for (const check of checks) {
    if (check.kind === undefined) {
      // No shape matched. There is nothing honest to name, so the suggestion says so by naming
      // nothing rather than picking the nearest kind.
      suggestions.push({ blokId: check.blokId, checkId: check.id, missing: [] });
      continue;
    }

    const params: CheckParams | undefined = paramsFor(check.kind, check.text);
    if (params !== undefined && check.kind !== "refuses_to_answer") continue;
    if (check.kind === "refuses_to_answer") continue;

    suggestions.push({
      blokId: check.blokId,
      checkId: check.id,
      kind: check.kind,
      phrase: CHECK_KIND_PHRASES[check.kind],
      missing: NEEDS[check.kind]
    });
  }

  return suggestions;
}
