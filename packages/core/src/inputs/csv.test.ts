// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

/** Narrow to the success shape, so a failing parse fails the test rather than the assertion below. */
function parsed(source: string) {
  const result = parseCsv(source);
  if (!result.ok) throw new Error(`expected a parse, got ${JSON.stringify(result.problem)}`);
  return result;
}

function problem(source: string) {
  const result = parseCsv(source);
  if (result.ok) throw new Error("expected a problem, got a parse");
  return result.problem;
}

describe("parseCsv", () => {
  it("reads a header and its rows", () => {
    const result = parsed("customer,order\nAda,A-1\nGrace,B-2\n");
    expect(result.header).toEqual(["customer", "order"]);
    expect(result.rows).toEqual([
      ["Ada", "A-1"],
      ["Grace", "B-2"]
    ]);
  });

  it("keeps a comma inside a quoted field", () => {
    expect(parsed('a,b\n"one, two",three\n').rows).toEqual([["one, two", "three"]]);
  });

  it("reads a doubled quote as one literal quote", () => {
    expect(parsed('a\n"she said ""no"""\n').rows).toEqual([['she said "no"']]);
  });

  it("keeps a newline inside a quoted field, and counts the line it started on", () => {
    const result = parsed('a,b\n"first\nsecond",x\ny,z\n');
    expect(result.rows).toEqual([
      ["first\nsecond", "x"],
      ["y", "z"]
    ]);
  });

  it("normalises a CRLF inside a quoted field to a newline", () => {
    // The value must not depend on which editor wrote the file.
    expect(parsed('a\r\n"first\r\nsecond"\r\n').rows).toEqual([["first\nsecond"]]);
  });

  it("ends records on CRLF, LF and a bare CR alike", () => {
    expect(parsed("a\r\n1\r\n2\r\n").rows).toEqual([["1"], ["2"]]);
    expect(parsed("a\n1\n2\n").rows).toEqual([["1"], ["2"]]);
    expect(parsed("a\r1\r2\r").rows).toEqual([["1"], ["2"]]);
  });

  it("strips a UTF-8 BOM, because Excel writes one", () => {
    // Left in place it becomes part of the first column's name, and the upload is then refused for
    // a reason nobody can see.
    expect(parsed("﻿customer\nAda\n").header).toEqual(["customer"]);
  });

  it("does not treat a trailing newline as an empty row", () => {
    expect(parsed("a\n1\n").rows).toHaveLength(1);
    expect(parsed("a\n1").rows).toHaveLength(1);
  });

  it("keeps a row of genuinely empty values", () => {
    expect(parsed("a,b\n,\n").rows).toEqual([["", ""]]);
  });

  it("does not trim a header cell, because ' customer' does not name customer", () => {
    expect(parsed(" customer,order\n1,2\n").header).toEqual([" customer", "order"]);
  });

  it("refuses a ragged row rather than padding it", () => {
    // Padding would bind an empty value into somebody's prompt and call it a success.
    expect(problem("a,b\n1,2\n3\n")).toEqual({ kind: "ragged_row", line: 3, expected: 2, found: 1 });
  });

  it("refuses an unterminated quote", () => {
    expect(problem('a,b\n"one,two\n')).toEqual({ kind: "unterminated_quote", line: 2 });
  });

  it("refuses a blank column name", () => {
    expect(problem("customer,,order\n1,2,3\n")).toEqual({ kind: "blank_column_name", column: 2 });
  });

  it("refuses a duplicate column name", () => {
    expect(problem("customer,customer\n1,2\n")).toEqual({ kind: "duplicate_column_name", name: "customer" });
  });

  it("refuses an empty file and a header with no rows", () => {
    expect(problem("")).toEqual({ kind: "empty" });
    expect(problem("\n\n")).toEqual({ kind: "empty" });
    expect(problem("customer\n")).toEqual({ kind: "empty" });
  });

  it("is a pure function of its input", () => {
    const source = 'a,b\n"one, two",3\n';
    expect(parseCsv(source)).toEqual(parseCsv(source));
  });
});
