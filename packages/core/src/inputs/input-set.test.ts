// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { inputSetProblems } from "./input-set.js";
import type { VariableDeclaration } from "../variables/types.js";

const required = (name: string): VariableDeclaration => ({ name, defaultValue: null, description: null });
const optional = (name: string): VariableDeclaration => ({ name, defaultValue: "x", description: null });

describe("inputSetProblems", () => {
  it("accepts a header that names exactly the declared variables", () => {
    expect(inputSetProblems(["customer", "order"], [required("customer"), required("order")])).toEqual([]);
  });

  it("does not care about column order", () => {
    expect(inputSetProblems(["order", "customer"], [required("customer"), required("order")])).toEqual([]);
  });

  it("refuses a column that matches no variable, naming it", () => {
    expect(inputSetProblems(["customer", "urgency"], [required("customer")])).toEqual([
      { kind: "unknown_column", name: "urgency" }
    ]);
  });

  it("refuses a required variable with no column, naming it", () => {
    expect(inputSetProblems(["customer"], [required("customer"), required("order")])).toEqual([
      { kind: "missing_required", name: "order" }
    ]);
  });

  it("accepts a file missing only an optional variable", () => {
    expect(inputSetProblems(["customer"], [required("customer"), optional("tone")])).toEqual([]);
  });

  it("reports every problem, so a file is fixed once rather than three times", () => {
    expect(inputSetProblems(["a", "b"], [required("c")])).toEqual([
      { kind: "unknown_column", name: "a" },
      { kind: "unknown_column", name: "b" },
      { kind: "missing_required", name: "c" }
    ]);
  });

  it("says a prompt declaring nothing cannot take an input set", () => {
    // Decision 1's third consequence. Not a bug — it falls out of "the header names the variables".
    expect(inputSetProblems(["anything"], [])).toEqual([{ kind: "no_variables_declared" }]);
    expect(inputSetProblems([], [])).toEqual([{ kind: "no_variables_declared" }]);
  });
});
