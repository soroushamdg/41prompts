import { describe, expect, it } from "vitest";
import {
  ACCOUNT_PURGE_WINDOW_DAYS,
  billingCustomers,
  newProjectId,
  plans,
  runBudgets,
  stripeEvents,
  subscriptions,
  users,
} from "./index";

describe("@41prompts/db", () => {
  it("exports the schema tables", () => {
    expect(users).toBeDefined();
  });

  it("exports the run budget tables", () => {
    expect(runBudgets).toBeDefined();
    // `plans` replaced EPIC-004's `plan_budget_defaults` in EPIC-070 — one table, and a plan's row
    // says everything a plan means rather than one fact about it.
    expect(plans).toBeDefined();
  });

  it("exports the billing tables", () => {
    expect(billingCustomers).toBeDefined();
    expect(subscriptions).toBeDefined();
    expect(stripeEvents).toBeDefined();
  });

  it("exports the purge window constant", () => {
    expect(ACCOUNT_PURGE_WINDOW_DAYS).toBe(30);
  });

  it("exports id helpers", () => {
    expect(newProjectId()).toMatch(/^proj_/);
  });
});
