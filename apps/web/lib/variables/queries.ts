import {
  extractVariables,
  variableIssues,
  type KeptSpan,
  type PromptBlok,
  type VariableDeclaration,
  type VariableIssue,
  type VariableOccurrence,
} from "@41prompts/core";
import { type VariableRow } from "@41prompts/db";
import type { CanvasBlok } from "@/lib/canvas/queries";

/**
 * Reads for the Variables tab, built from rows a page has already read.
 *
 * **Nothing here talks to the database.** It used to: `variablesForOwner` resolved the prompt
 * through `promptForOwner` and then read the rows itself, and both pages that show this tab had
 * already read those rows for the canvas — so it was a second query nobody called. EPIC-900's
 * dead-code gate found it named nowhere and it is gone; owner scoping lives where the reading
 * does, in `lib/canvas/queries.ts`.
 */

export interface VariablesView {
  declarations: VariableRow[];
  occurrences: readonly VariableOccurrence[];
  issues: readonly VariableIssue[];
}

/**
 * Build the view from rows already read, so a page that has the canvas does not read it twice.
 *
 * `keep` is rebuilt here for the same reason `compiledForBloks` rebuilds it: a hand-edited span is
 * the text that ships, so a `{{customer}}` typed into one is a use and one edited out of a span is
 * not. Passing only `blok.text` would answer for the prompt that would have shipped.
 */
export function variablesViewFor(rows: readonly CanvasBlok[], declarations: VariableRow[]): VariablesView {
  const bloks: PromptBlok[] = rows.map((row, index) => ({
    id: row.id,
    kind: row.kind,
    text: row.text,
    order: index,
  }));

  const keep = new Map<string, KeptSpan>();
  for (const row of rows) {
    if (row.editedText !== null && row.editedFromHash !== null) {
      keep.set(row.id, { text: row.editedText, hash: row.editedFromHash });
    }
  }

  const occurrences = extractVariables(bloks, { keep });
  return { declarations, occurrences, issues: variableIssues(occurrences, asDeclarations(declarations)) };
}

/** The database row, narrowed to the three fields core cares about. */
export function asDeclarations(rows: readonly VariableRow[]): VariableDeclaration[] {
  return rows.map((row) => ({
    name: row.name,
    defaultValue: row.defaultValue,
    description: row.description,
  }));
}
