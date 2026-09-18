// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { isOptional, type VariableDeclaration } from "../variables/types.js";
import type { ColumnProblem } from "./types.js";

/**
 * Does this header bind this prompt? EPIC-032 decision 1, in both directions.
 *
 * **At upload, not at run time.** A column matching no variable would be silently ignored by every
 * run; a required variable with no column would fail every run. Either way the person finds out
 * much later, from a result rather than from the file — which is the whole reason this is a
 * decision rather than a detail.
 *
 * **A prompt that declares no variables cannot take an input set**, and that falls out of "the
 * header names the variables" rather than being an extra rule. It is not a bug and the upload
 * surface says so plainly instead of accepting a file it cannot bind.
 *
 * **An optional variable may be absent.** `isOptional` is the one question asked of
 * `defaultValue` — a variable is optional exactly when it has a default to fall back on — and a run
 * that used one says so.
 *
 * Every problem is reported, not just the first: a file with three unknown columns should be fixed
 * once, not three times.
 */
export function inputSetProblems(
  header: readonly string[],
  declarations: readonly VariableDeclaration[]
): readonly ColumnProblem[] {
  if (declarations.length === 0) return [{ kind: "no_variables_declared" }];

  const declared = new Map(declarations.map((declaration) => [declaration.name, declaration]));
  const columns = new Set(header);
  const problems: ColumnProblem[] = [];

  for (const name of header) {
    if (!declared.has(name)) problems.push({ kind: "unknown_column", name });
  }
  for (const declaration of declarations) {
    if (columns.has(declaration.name)) continue;
    if (isOptional(declaration)) continue;
    problems.push({ kind: "missing_required", name: declaration.name });
  }

  return problems;
}
