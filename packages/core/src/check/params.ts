// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { CheckKind } from "../compile/types.js";
import { isPatternSafe } from "./pattern-safety.js";

/**
 * What each kind needs in order to grade anything, derived from the blok's **verbatim** text.
 *
 * ## Deriving may fail, and failing is not an error
 *
 * EPIC-030 decision 7. "Reply in at most 80 words" carries a limit. "Reply briefly" does not. The
 * second is `not_graded`, not a crash and not a default — a check that asserts a number nobody wrote
 * fails a publish for the wrong reason, which is worse than no check at all. `checks.ts` made the
 * same call one level up when it chose `undefined` over guessing a kind.
 */

export type CheckParams =
  | { readonly kind: "json_shape"; readonly expectedKeys: readonly string[] }
  | { readonly kind: "allowed_values"; readonly values: readonly string[] }
  | { readonly kind: "word_limit"; readonly limit: number }
  | { readonly kind: "character_limit"; readonly limit: number }
  | { readonly kind: "must_contain"; readonly needle: string }
  | { readonly kind: "must_not_contain"; readonly needle: string }
  | { readonly kind: "matches_pattern"; readonly pattern: string; readonly flags: string }
  | { readonly kind: "refuses_to_answer" };

/** A number written as digits, in the neighbourhood of a limit phrase. */
function firstNumber(text: string): number | undefined {
  const match = /\b(\d{1,6})\b/.exec(text);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

/**
 * The quoted run a rule is about.
 *
 * Only straight and curly double quotes, and only the first. A rule that quotes nothing has not told
 * us what to look for, and inferring the phrase from the surrounding prose would be inventing an
 * assertion — the thing this module exists not to do.
 */
function firstQuoted(text: string): string | undefined {
  // Quote characters are written as escapes, not literally. `pattern-shape.test.ts`'s audit blanks
  // quoted strings before it scans for regex literals, so a `"` inside a literal comes back mangled
  // — and a pattern whose audited form is corrupted is one nobody can review, which is the whole
  // point of the reviewed list. `\x22` is `"`, `\u201C`/`\u201D` are the curly pair.
  const match = /[\x22\u201C]([^\x22\u201D]{1,200})[\x22\u201D]/.exec(text);
  return match?.[1];
}

/**
 * A comma or "or" separated list after a "one of" phrase.
 *
 * Returns at least two values or nothing: a list of one is not a list, and treating it as one would
 * turn "one of: yes" into an equality check nobody asked for.
 */
function listAfterOneOf(text: string): readonly string[] | undefined {
  const match = /\bone of\b[^:]{0,30}:?\s*(.+)$/is.exec(text);
  if (!match?.[1]) return undefined;
  const values = match[1]
    .split(/\s*(?:,|\bor\b)\s*/i)
    .map((value) => value.trim().replace(/^[\x22\u201C\u2018]|[\x22\u201D\u2019.]$/g, "").trim())
    .filter((value) => value.length > 0);
  return values.length >= 2 ? values : undefined;
}

/** Keys named in a rule about JSON, as quoted or backticked identifiers. */
function keysIn(text: string): readonly string[] | undefined {
  const keys = [...text.matchAll(/[\x60\x22\u201C\u2018]([A-Za-z_][A-Za-z0-9_]{0,60})[\x60\x22\u201D\u2019]/g)].map(
    (match) => match[1]!
  );
  const unique = [...new Set(keys)];
  return unique.length > 0 ? unique : undefined;
}

/**
 * Derive the parameters for a known kind, or `undefined` when the text does not carry them.
 *
 * Deliberately conservative everywhere. Each helper above returns nothing rather than a guess, and
 * this function does no repair: if the shape said "word limit" and no number is present, the honest
 * answer is that we cannot grade it.
 */
export function paramsFor(kind: CheckKind, text: string): CheckParams | undefined {
  switch (kind) {
    case "json_shape": {
      const expectedKeys = keysIn(text);
      return expectedKeys ? { kind, expectedKeys } : undefined;
    }
    case "allowed_values": {
      const values = listAfterOneOf(text);
      return values ? { kind, values } : undefined;
    }
    case "word_limit": {
      const limit = firstNumber(text);
      return limit === undefined ? undefined : { kind, limit };
    }
    case "character_limit": {
      const limit = firstNumber(text);
      return limit === undefined ? undefined : { kind, limit };
    }
    case "must_contain": {
      const needle = firstQuoted(text);
      return needle ? { kind, needle } : undefined;
    }
    case "must_not_contain": {
      const needle = firstQuoted(text);
      return needle ? { kind, needle } : undefined;
    }
    case "matches_pattern": {
      const pattern = firstQuoted(text);
      // The filter runs here, at derivation, not at grade time — so a refused pattern never reaches
      // the engine and `grade()` cannot be handed something that will not return.
      if (!pattern || !isPatternSafe(pattern, "")) return undefined;
      return { kind, pattern, flags: "" };
    }
    case "refuses_to_answer":
      // No parameters, and nothing to derive. It is un-gradable for a different reason entirely —
      // see `graders.ts`.
      return { kind };
  }
}
