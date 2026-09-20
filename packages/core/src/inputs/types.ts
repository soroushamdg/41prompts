// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * What can be wrong with a CSV, as a **fact rather than a sentence**.
 *
 * The same rule `Evidence` lives under (EPIC-030 decision 5, and `CLAUDE.md` rule 3's reasoning
 * applied to output): this package states what it found and where, and `apps/web` turns that into
 * English. A message written here would be a message no surface could reword, translate, or place
 * next to the field it is about.
 *
 * Line numbers are **1-based and count lines of the file**, not of the record, because that is what
 * a person sees in the editor they will go and fix it in. A quoted field containing newlines spans
 * several of them; the line reported is where the record started.
 */
export type CsvProblem =
  /** No content at all, or a header and nothing else. */
  | { readonly kind: "empty" }
  /** A quoted field was opened and the file ended inside it. */
  | { readonly kind: "unterminated_quote"; readonly line: number }
  /** A record has a different number of fields from the header. */
  | { readonly kind: "ragged_row"; readonly line: number; readonly expected: number; readonly found: number }
  /** A header cell is blank, so a column exists that nothing can name. */
  | { readonly kind: "blank_column_name"; readonly column: number }
  /** Two header cells carry the same name, so a row's value for it is ambiguous. */
  | { readonly kind: "duplicate_column_name"; readonly name: string };

export type CsvParse =
  | {
      readonly ok: true;
      readonly header: readonly string[];
      /** One entry per record after the header, each the same length as `header`. */
      readonly rows: readonly (readonly string[])[];
    }
  | { readonly ok: false; readonly problem: CsvProblem };

/**
 * Why a header and a prompt's declared variables disagree.
 *
 * EPIC-032 decision 1: **at upload, not at run time**, and in both directions. A column matching no
 * variable would be silently ignored by a run; a required variable with no column would fail one.
 * Both are refused here, where the person still has the file in front of them.
 */
export type ColumnProblem =
  /** The prompt declares nothing, so a header has nothing to name. Not a bug — decision 1. */
  | { readonly kind: "no_variables_declared" }
  | { readonly kind: "unknown_column"; readonly name: string }
  | { readonly kind: "missing_required"; readonly name: string };

/**
 * Why a set typed into the product cannot be saved (EPIC-032a).
 *
 * Deliberately **not** shared with `CsvProblem`. The two paths refuse different things: a typed grid
 * has no quoting to get wrong and no header to mis-name, and a file has no concept of "you have not
 * typed anything yet". Folding them into one union would give every surface a set of cases it can
 * never show, which is how a refusal message ends up describing a file to somebody who did not
 * upload one.
 */
export type ByHandProblem =
  /** Every row was empty, so there is nothing to run. Not an error the file path can have. */
  | { readonly kind: "no_rows" }
  | { readonly kind: "too_many_rows"; readonly found: number; readonly limit: number }
  /** A row has a different number of cells from the derived columns — a defect in the caller. */
  | { readonly kind: "ragged_row"; readonly row: number; readonly expected: number; readonly found: number }
  | { readonly kind: "too_large"; readonly found: number; readonly limit: number };

/** The two numbers `byHandProblems` measures against. `apps/web/lib/runs/limits.ts` owns the values. */
export interface GridLimits {
  readonly maxInputs: number;
  /** Counted in UTF-16 code units across every cell — see `byHandProblems`. */
  readonly maxCharacters: number;
}
