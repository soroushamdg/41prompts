// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { ByHandProblem, GridLimits } from "./types.js";

/**
 * An input set typed into the product instead of uploaded as a file (EPIC-032a).
 *
 * ## Why this is logic and not three `if`s in a component
 *
 * `CLAUDE.md` rule 1. Each of the three rules below is a decision with an off-by-one or an empty
 * case in it, and each one decides whether somebody's money is spent:
 *
 * - **the row count**, which is what a run is billed per;
 * - **what counts as a row at all**, which decides whether a trailing empty line the person left
 *   behind becomes an input bound to empty strings and sent to a model;
 * - **the size**, which is the guard on a paste rather than on a file (`apps/web/lib/runs/limits.ts`
 *   has the same argument for the upload path).
 *
 * `parseCsv` does the equivalent work for the other path, and it lives here for the same reason.
 *
 * ## It states facts, never sentences
 *
 * Like `CsvProblem` and `ColumnProblem` before it — EPIC-030 decision 5, and rule 3's reasoning
 * applied to output. `apps/web` turns a `ByHandProblem` into English, because a sentence written
 * here is a sentence no surface can reword or place beside the field it is about.
 */

/**
 * Drop the rows a person did not mean to type.
 *
 * **A row of entirely empty cells is not a row.** A grid hands back whatever its last empty line
 * contained, and every editor leaves one: the CSV parser makes the same decision about a trailing
 * newline for the same reason, and this is that rule for the typed path. A row with *some* values
 * and some blanks is kept exactly as typed — a blank cell is a real value for an optional variable,
 * and deciding otherwise here would bind a default the person did not ask for.
 *
 * Nothing is trimmed. `addInputSet`'s comment — *"the rows go in exactly as parsed — no trim, no
 * normalisation"* — is a property of the store that this path must not quietly break: leading space
 * inside a value can be the whole point of a test case about whitespace.
 */
export function rowsFromGrid(rows: readonly (readonly string[])[]): readonly (readonly string[])[] {
  return rows.filter((row) => row.some((cell) => cell !== ""));
}

/**
 * What is wrong with a typed set, in the order it costs to find out.
 *
 * `columns` is **derived from the declared variables** by the caller and never typed by a person
 * (EPIC-032a decision 2), so `unknown_column` and `missing_required` cannot arise from this path.
 * They are still checked, by `inputSetProblems`, at the same point in the same action — as the
 * control that the two writers cannot diverge, not as a case this function handles.
 */
export function byHandProblems(
  rows: readonly (readonly string[])[],
  columns: readonly string[],
  limits: GridLimits,
): readonly ByHandProblem[] {
  const problems: ByHandProblem[] = [];

  if (rows.length === 0) {
    problems.push({ kind: "no_rows" });
    return problems;
  }

  if (rows.length > limits.maxInputs) {
    problems.push({ kind: "too_many_rows", found: rows.length, limit: limits.maxInputs });
  }

  const ragged = rows.findIndex((row) => row.length !== columns.length);
  if (ragged !== -1) {
    problems.push({
      kind: "ragged_row",
      // 1-based, and counted in rows of the grid the person is looking at — the same choice
      // `CsvProblem` makes about lines of the file, for the same reason.
      row: ragged + 1,
      expected: columns.length,
      found: rows[ragged]!.length,
    });
  }

  // Measured on the values, because that is what is stored and what a prompt is built from. Counted
  // in UTF-16 code units, which is what `String.length` is and what the upload path's byte guard is
  // compared against; the two are not the same unit and the difference is in the safe direction for
  // every non-ASCII value, which is the direction a guard should err.
  const size = rows.reduce((total, row) => total + row.reduce((sum, cell) => sum + cell.length, 0), 0);
  if (size > limits.maxCharacters) {
    problems.push({ kind: "too_large", found: size, limit: limits.maxCharacters });
  }

  return problems;
}
