import { describe, expect, it } from "vitest";
import { ACCOUNT_PURGE_WINDOW_DAYS, newProjectId, users } from "./index";

describe("@41prompts/db", () => {
  it("exports the schema tables", () => {
    expect(users).toBeDefined();
  });

  it("exports the purge window constant", () => {
    expect(ACCOUNT_PURGE_WINDOW_DAYS).toBe(30);
  });

  it("exports id helpers", () => {
    expect(newProjectId()).toMatch(/^proj_/);
  });
});
