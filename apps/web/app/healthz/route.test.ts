import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

describe("/healthz", () => {
  const originalSha = process.env.COMMIT_SHA;
  const originalSourceCommit = process.env.SOURCE_COMMIT;
  const originalEnv = process.env.DEPLOY_ENV;

  afterEach(() => {
    if (originalSha === undefined) delete process.env.COMMIT_SHA;
    else process.env.COMMIT_SHA = originalSha;
    if (originalSourceCommit === undefined) delete process.env.SOURCE_COMMIT;
    else process.env.SOURCE_COMMIT = originalSourceCommit;
    if (originalEnv === undefined) delete process.env.DEPLOY_ENV;
    else process.env.DEPLOY_ENV = originalEnv;
  });

  it("returns ok true with commit and env from process.env", async () => {
    process.env.COMMIT_SHA = "abc123";
    delete process.env.SOURCE_COMMIT;
    process.env.DEPLOY_ENV = "staging";

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "abc123", env: "staging" });
  });

  it("falls back to unknown/development when unset", async () => {
    delete process.env.COMMIT_SHA;
    delete process.env.SOURCE_COMMIT;
    delete process.env.DEPLOY_ENV;

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "unknown", env: "development" });
  });

  it("falls back to SOURCE_COMMIT when COMMIT_SHA is the unknown placeholder", async () => {
    // Reproduces the Follow-up F2 defect: COMMIT_SHA is always *set* (the Dockerfile ARG
    // defaults it to "unknown"), so a plain `??` fallback would never reach SOURCE_COMMIT —
    // this pins the sentinel-check behavior that fixes it.
    process.env.COMMIT_SHA = "unknown";
    process.env.SOURCE_COMMIT = "real-sha-from-coolify";
    process.env.DEPLOY_ENV = "staging";

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "real-sha-from-coolify", env: "staging" });
  });

  it("prefers COMMIT_SHA over SOURCE_COMMIT when both are real values", async () => {
    process.env.COMMIT_SHA = "build-time-sha";
    process.env.SOURCE_COMMIT = "runtime-sha";
    process.env.DEPLOY_ENV = "staging";

    const response = GET();
    const body = await response.json();

    expect(body).toEqual({ ok: true, commit: "build-time-sha", env: "staging" });
  });
});
