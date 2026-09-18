// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { occurrencesInText } from "../variables/extract.js";
import { isOptional, type VariableDeclaration } from "../variables/types.js";

/**
 * One row of an input set, bound into the compiled prompt.
 *
 * ## The row is substituted, never appended (EPIC-032 decision 1)
 *
 * The columns **are** the variable bindings, so `{{customer}}` becomes the row's value in the text
 * the model receives. `executeRun` used to send `compiled + "\n\n" + input`, which with a bound
 * prompt sends every value a second time — and the output stays plausible, so nobody notices.
 * `RunRequest.input` remains the canonical serialisation of the row for `inputHash` and the cache
 * key; it is hashed rather than appended.
 */

export interface BoundPrompt {
  readonly ok: true;
  readonly text: string;
  /**
   * Names the row did not supply that fell back to their declared default, in the order they
   * appear. The run says so, per decision 1's second consequence: a value nobody typed is a fact
   * about what ran.
   */
  readonly usedDefaults: readonly string[];
}

/** Required names with nothing to bind. Decision 1 refuses these at upload; this is the backstop. */
export interface UnboundPrompt {
  readonly ok: false;
  readonly missing: readonly string[];
}

export type BindOutcome = BoundPrompt | UnboundPrompt;

/**
 * Substitute one row into one compiled prompt.
 *
 * ## A value is inserted verbatim and is never rescanned
 *
 * Replacement is computed from the occurrence offsets of the **original** text and applied right to
 * left, so every offset is still valid when it is used and nothing a value contains can be read as
 * a placeholder. That is not a nicety: a support transcript that happens to contain `{{name}}`
 * would otherwise be substituted into, turning a customer's words into a binding. A value that *is*
 * a placeholder — `"{{other}}"` — is inserted as those eleven characters and stops there.
 *
 * Left to right would be wrong for a second reason as well: a value longer than its placeholder
 * shifts every later offset, so the second substitution would land in the middle of the first.
 *
 * ## A missing required name refuses rather than empties
 *
 * An empty string is a real value — `{{extra_instructions}}` with a default of `""` is the case
 * `prompt_variables.defaultValue` distinguishes null from empty for. So "nobody supplied this" and
 * "somebody supplied nothing" cannot share a representation here, and the first one refuses.
 */
export function bindVariables(
  text: string,
  values: ReadonlyMap<string, string>,
  declarations: readonly VariableDeclaration[]
): BindOutcome {
  const defaults = new Map(
    declarations.filter((declaration) => isOptional(declaration)).map((d) => [d.name, d.defaultValue as string])
  );

  const occurrences = occurrencesInText(text, "bind");

  const missing: string[] = [];
  const usedDefaults: string[] = [];
  const seenMissing = new Set<string>();
  const seenDefaulted = new Set<string>();

  for (const occurrence of occurrences) {
    if (values.has(occurrence.name)) continue;
    if (defaults.has(occurrence.name)) {
      if (!seenDefaulted.has(occurrence.name)) {
        seenDefaulted.add(occurrence.name);
        usedDefaults.push(occurrence.name);
      }
      continue;
    }
    if (!seenMissing.has(occurrence.name)) {
      seenMissing.add(occurrence.name);
      missing.push(occurrence.name);
    }
  }

  if (missing.length > 0) return { ok: false, missing };

  let out = text;
  for (const occurrence of [...occurrences].reverse()) {
    const value = values.get(occurrence.name) ?? defaults.get(occurrence.name);
    if (value === undefined) continue;
    out = out.slice(0, occurrence.start) + value + out.slice(occurrence.end);
  }

  return { ok: true, text: out, usedDefaults };
}

/**
 * The canonical serialisation of a row: what `inputHash` and the cache key are computed over.
 *
 * Keys sorted, `JSON.stringify` of the pairs. Sorted for the same reason `cacheKeyFor` sorts
 * parameter keys — two identical rows written in a different column order are one cache entry
 * rather than two. `JSON.stringify` of an array is injective, so no two distinct rows can serialise
 * alike whatever the values contain, which a separator-joined string cannot promise about text a
 * person wrote.
 */
export function serialiseRow(values: ReadonlyMap<string, string>): string {
  const pairs = [...values.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify(pairs);
}
