// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { byHandProblems, rowsFromGrid } from "./by-hand.js";
import type { GridLimits } from "./types.js";

const LIMITS: GridLimits = { maxInputs: 100, maxCharacters: 512 * 1024 };

describe("rowsFromGrid", () => {
  it("drops a row whose cells are all empty", () => {
    expect(rowsFromGrid([["a"], [""], ["b"]])).toEqual([["a"], ["b"]]);
  });

  it("keeps a row with some values and some blanks", () => {
    // A blank cell is a real value for an optional variable. Dropping this row would bind a
    // declared default the person never asked for.
    expect(rowsFromGrid([["a", ""]])).toEqual([["a", ""]]);
  });

  it("keeps whitespace exactly as typed", () => {
    // `addInputSet` stores rows with no trim and no normalisation; a test case about leading space
    // is a real thing to want, and trimming here would make it unexpressible.
    expect(rowsFromGrid([[" a "]])).toEqual([[" a "]]);
    expect(rowsFromGrid([[" "]])).toEqual([[" "]]);
  });

  it("returns nothing for a grid of only empty rows", () => {
    expect(rowsFromGrid([[""], ["", ""]])).toEqual([]);
  });
});

describe("byHandProblems", () => {
  it("accepts a grid that is within every limit", () => {
    expect(byHandProblems([["a"], ["b"]], ["input"], LIMITS)).toEqual([]);
  });

  it("refuses an empty grid, and says nothing else about it", () => {
    // The only problem, deliberately: reporting "no rows" and "too large" together would be noise.
    expect(byHandProblems([], ["input"], LIMITS)).toEqual([{ kind: "no_rows" }]);
  });

  it("accepts exactly the limit and refuses one more", () => {
    const at = Array.from({ length: LIMITS.maxInputs }, () => ["x"]);
    expect(byHandProblems(at, ["input"], LIMITS)).toEqual([]);

    const over = [...at, ["x"]];
    expect(byHandProblems(over, ["input"], LIMITS)).toEqual([
      { kind: "too_many_rows", found: 101, limit: 100 },
    ]);
  });

  it("reports a ragged row with a 1-based index", () => {
    const problems = byHandProblems([["a", "b"], ["c"]], ["one", "two"], LIMITS);
    expect(problems).toEqual([{ kind: "ragged_row", row: 2, expected: 2, found: 1 }]);
  });

  it("measures size across every cell, not per cell", () => {
    const limits: GridLimits = { maxInputs: 100, maxCharacters: 10 };
    // Six characters in one row, six in another: neither cell is over, the set is.
    expect(byHandProblems([["abcdef"], ["ghijkl"]], ["input"], limits)).toEqual([
      { kind: "too_large", found: 12, limit: 10 },
    ]);
  });

  it("accepts exactly the size limit", () => {
    const limits: GridLimits = { maxInputs: 100, maxCharacters: 4 };
    expect(byHandProblems([["abcd"]], ["input"], limits)).toEqual([]);
  });

  it("reports both a count and a size problem when both are true", () => {
    // Not an early return: a person who has pasted far too much should be told everything that is
    // wrong in one go rather than made to fix it twice.
    const limits: GridLimits = { maxInputs: 1, maxCharacters: 3 };
    expect(byHandProblems([["abcd"], ["efgh"]], ["input"], limits)).toEqual([
      { kind: "too_many_rows", found: 2, limit: 1 },
      { kind: "too_large", found: 8, limit: 3 },
    ]);
  });
});
