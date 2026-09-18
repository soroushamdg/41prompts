// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { applyBudgetIncrement } from "./budgets.js";

describe("applyBudgetIncrement", () => {
  it("allows an increment that lands under the cap", () => {
    const result = applyBudgetIncrement({ capCents: 1000, spentCents: 200 }, 300);
    expect(result).toEqual({ allowed: true, spentCents: 500 });
  });

  it("allows an increment that lands exactly on the cap (the boundary)", () => {
    const result = applyBudgetIncrement({ capCents: 1000, spentCents: 900 }, 100);
    expect(result).toEqual({ allowed: true, spentCents: 1000 });
  });

  it("rejects an increment one cent over the cap", () => {
    const result = applyBudgetIncrement({ capCents: 1000, spentCents: 900 }, 101);
    expect(result).toEqual({ allowed: false, spentCents: 900 });
  });

  it("rejects any increment once already at the cap", () => {
    const result = applyBudgetIncrement({ capCents: 1000, spentCents: 1000 }, 1);
    expect(result).toEqual({ allowed: false, spentCents: 1000 });
  });

  it("allows a zero-amount increment even at the cap", () => {
    const result = applyBudgetIncrement({ capCents: 1000, spentCents: 1000 }, 0);
    expect(result).toEqual({ allowed: true, spentCents: 1000 });
  });

  it("rejects a negative amount rather than silently reducing spend", () => {
    expect(() => applyBudgetIncrement({ capCents: 1000, spentCents: 500 }, -1)).toThrow(
      "amountCents must not be negative",
    );
  });
});
