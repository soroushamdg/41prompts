import { describe, expect, it } from "vitest";
import { EVENT_NAMES, isEventName } from "./events";

describe("event names", () => {
  it("is exactly the nine names this epic names, in order", () => {
    expect(EVENT_NAMES).toEqual([
      "signup",
      "login",
      "decompile_view",
      "decompile_run",
      "decompile_share",
      "project_created",
      "run_started",
      "run_passed",
      "publish",
    ]);
  });

  it("accepts a name from the closed set", () => {
    expect(isEventName("signup")).toBe(true);
    expect(isEventName("publish")).toBe(true);
  });

  it("rejects a name outside the closed set", () => {
    expect(isEventName("something_else")).toBe(false);
    expect(isEventName("Signup")).toBe(false);
  });
});
