import {
  extractVariables,
  variableIssues,
  type KeptSpan,
  type PromptBlok,
  type VariableDeclaration,
  type VariableIssue,
  type VariableOccurrence,
} from "@41prompts/core";
import { promptForOwner, variablesForPrompt, type Db, type VariableRow } from "@41prompts/db";
import type { CanvasBlok } from "@/lib/canvas/queries";

/**
 * Reads for the Variables tab. **Owner-scoped like everything else** — it resolves the prompt
 * through `promptForOwner` first and returns `undefined` when it does not, which the route turns
 * into 404 rather than 403.
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

export async function variablesForOwner(db: Db, promptId: string, owner: string) {
  const prompt = await promptForOwner(db, promptId, owner);
  if (prompt === undefined) return undefined;
  return variablesForPrompt(db, promptId);
}
