import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/healthz", () => {
  const originalSha = process.env.COMMIT_SHA;
  const originalEnv = process.env.DEPLOY_ENV;

  afterEach(() => {
    if (originalSha === undefined) delete process.env.COMMIT_SHA;
    else process.env.COMMIT_SHA = originalSha;
    if (originalEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = originalEnv;
  });

  it("returns ok true with commit and env from process.env", async () => {
    process.env.COMMIT_SHA = "abc123";
    process.env.DEPLOY_ENV = "staging";

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "abc123", env: "staging" });
  });

  it("falls back to unknown/development when unset", async () => {
    delete process.env.COMMIT_SHA;
    delete process.env.DEPLOY_ENV;

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "unknown", env: "development" });
  });
});
