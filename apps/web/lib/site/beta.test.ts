import { describe, expect, it } from "vitest";
import { betaEnvironment } from "./beta";

describe("betaEnvironment", () => {
  it("names production and staging", () => {
    expect(betaEnvironment("production")).toBe("production");
    expect(betaEnvironment("staging")).toBe("staging");
  });

  it("shows nothing locally, in e2e, or for anything it does not recognise", () => {
    for (const value of [undefined, "", "development", "Production", "test"]) {
      expect(betaEnvironment(value), String(value)).toBeUndefined();
    }
  });
});
