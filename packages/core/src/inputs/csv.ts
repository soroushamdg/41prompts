// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import type { CsvParse, CsvProblem } from "./types.js";

/**
 * RFC 4180, by hand, with zero dependencies.
 *
 * ## Why this is here and not behind a package
 *
 * `packages/core` declares no dependencies and dependency-cruiser fails the build on one
 * (`CLAUDE.md` rule 11), and this is logic that has to be correct (rule 1): a parser that loses a
 * comma inside a quoted field binds the wrong value into somebody's prompt and the model still
 * answers plausibly. It is also small — the whole grammar is four characters — so the trade is a
 * hundred lines against a dependency in the one package that has none.
 *
 * ## What real files do that the RFC does not say
 *
 * - **A UTF-8 BOM.** Excel writes one. Left in place it becomes part of the first column's name,
 *   so the first column arrives as U+FEFF followed by `customer`, matches no declared variable,
 *   and the upload is refused for a reason nobody can see — the character is invisible in every
 *   editor that would be used to look. Stripped, once, only at position zero. (Written as a code
 *   point rather than pasted: a literal BOM in this comment is what `no-irregular-whitespace`
 *   exists to catch, and it would be just as invisible here.)
 * - **CRLF, LF and a bare CR.** All three end a record. Inside a quoted field they are data, and a
 *   CRLF there is normalised to `\n` so the value does not depend on which editor wrote the file.
 * - **A trailing newline.** Every text editor adds one; it is not an empty final record.
 *
 * ## What it refuses rather than repairs
 *
 * A ragged row, an unterminated quote, a blank header cell and a duplicate header name each get a
 * named `CsvProblem`. Padding a short row with empty strings would bind an empty value into a
 * prompt and call it a success, which is the failure decision 1 exists to move to upload time.
 */
export function parseCsv(source: string): CsvParse {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;

  const records: { fields: string[]; line: number }[] = [];
  let fields: string[] = [];
  let field = "";
  let line = 1;
  let recordLine = 1;
  let quoted = false;
  let sawAnyCharacter = false;

  const endField = (): void => {
    fields.push(field);
    field = "";
  };
  const endRecord = (): void => {
    endField();
    // A record of one empty field is a blank line, which is not a record. Anything else is,
    // including a genuine row of empty values written as `,,`.
    if (!(fields.length === 1 && fields[0] === "")) records.push({ fields, line: recordLine });
    fields = [];
    recordLine = line;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] as string;

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          // A doubled quote inside a quoted field is one literal quote.
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
        continue;
      }
      if (char === "\r") {
        // A CRLF inside a field is data, and it is stored as `\n` so the value does not carry the
        // line ending of whichever machine wrote the file.
        if (text[i + 1] === "\n") i += 1;
        field += "\n";
        line += 1;
        continue;
      }
      if (char === "\n") line += 1;
      field += char;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
      sawAnyCharacter = true;
      continue;
    }
    if (char === ",") {
      sawAnyCharacter = true;
      endField();
      continue;
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      line += 1;
      endRecord();
      continue;
    }
    sawAnyCharacter = true;
    field += char;
  }

  if (quoted) return { ok: false, problem: { kind: "unterminated_quote", line: recordLine } };
  // Whatever is left is the last record, unless the file ended on a newline — in which case there
  // is nothing pending and `endRecord` drops it as a blank line.
  if (field !== "" || fields.length > 0) endRecord();

  if (records.length === 0 || !sawAnyCharacter) return { ok: false, problem: { kind: "empty" } };

  const header = (records[0] as { fields: string[] }).fields;
  const headerProblem = headerProblemIn(header);
  if (headerProblem) return { ok: false, problem: headerProblem };

  const rows: string[][] = [];
  for (const record of records.slice(1)) {
    if (record.fields.length !== header.length) {
      return {
        ok: false,
        problem: { kind: "ragged_row", line: record.line, expected: header.length, found: record.fields.length }
      };
    }
    rows.push(record.fields);
  }

  if (rows.length === 0) return { ok: false, problem: { kind: "empty" } };

  return { ok: true, header, rows };
}

/**
 * The header's own two failures.
 *
 * A blank cell means a column nothing can name, and a duplicate means a row whose value for that
 * name is ambiguous — neither can be bound, and both are much cheaper to refuse than to discover
 * when a run produces the wrong answer. The header is **not trimmed**: a column written as
 * `" customer"` does not name `customer`, and silently trimming it would accept a file whose
 * binding differs from what it says.
 */
function headerProblemIn(header: readonly string[]): CsvProblem | undefined {
  const seen = new Set<string>();
  for (const [index, name] of header.entries()) {
    if (name === "") return { kind: "blank_column_name", column: index + 1 };
    if (seen.has(name)) return { kind: "duplicate_column_name", name };
    seen.add(name);
  }
  return undefined;
}
