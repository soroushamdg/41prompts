import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/dev/throw", () => {
  const originalEnv = process.env.DEPLOY_ENV;

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = originalEnv;
  });

  it("throws in development", () => {
    process.env.DEPLOY_ENV = "development";
    expect(() => GET()).toThrow(/deliberate error/);
  });

  it("throws in staging", () => {
    process.env.DEPLOY_ENV = "staging";
    expect(() => GET()).toThrow(/deliberate error/);
  });

  it("404s in production instead of throwing", () => {
    process.env.DEPLOY_ENV = "production";
    const response = GET();
    expect(response.status).toBe(404);
  });
});
