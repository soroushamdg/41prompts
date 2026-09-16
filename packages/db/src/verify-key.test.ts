import { describe, expect, it } from "vitest";
import {
  FAKE_REJECTED_PREFIX,
  refusalWords,
  verificationIsFaked,
  verifyProviderKey,
  verifyProviderKeyOrFake,
  type FetchLike,
} from "./verify-key";

/**
 * Every test here runs offline. **No test in this repository calls a provider**, and the injected
 * `FetchLike` is what makes that structural rather than a promise.
 *
 * The assertions are mostly about the *request*, not the response: a verifier that answers
 * correctly while asking the wrong endpoint, or while putting the credential somewhere it must not
 * go, is the failure this module exists to prevent.
 */

const KEY = "sk-ant-api03-Zq7WcR2mLv9Xb4Nt6Kd1Pf8Hj3Ug5Ay0Se";

function recording(status: number, body = "") {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const impl: FetchLike = async (url, init) => {
    seen.push({ url, headers: init.headers });
    return { ok: status < 400, status, text: async () => body };
  };
  return { seen, impl };
}

describe("verifyProviderKey", () => {
  it("asks each provider its own models endpoint", async () => {
    for (const [provider, host] of [
      ["anthropic", "api.anthropic.com"],
      ["openai", "api.openai.com"],
      ["google", "generativelanguage.googleapis.com"],
    ] as const) {
      const { seen, impl } = recording(200);
      const verdict = await verifyProviderKey(provider, KEY, impl);
      expect(verdict.ok).toBe(true);
      expect(seen).toHaveLength(1);
      expect(new URL(seen[0]!.url).host).toBe(host);
    }
  });

  /**
   * The one that matters most. Google's endpoint accepts `?key=`, and a URL carrying the key would
   * put it into every error message, log line and stored `last_test_detail` derived from it.
   */
  it("never puts the key in a URL, at any provider", async () => {
    for (const provider of ["anthropic", "openai", "google"] as const) {
      const { seen, impl } = recording(200);
      await verifyProviderKey(provider, KEY, impl);
      expect(seen[0]!.url).not.toContain(KEY);
      // And it is genuinely being sent, in a header, or this test would pass on a call that
      // authenticated with nothing at all.
      expect(Object.values(seen[0]!.headers).join(" ")).toContain(KEY);
    }
  });

  it("reads 401 as rejected and 403 as forbidden", async () => {
    const rejected = await verifyProviderKey("openai", KEY, recording(401, "bad key").impl);
    expect(rejected).toMatchObject({ ok: false, reason: "rejected" });

    const forbidden = await verifyProviderKey("openai", KEY, recording(403, "no access").impl);
    expect(forbidden).toMatchObject({ ok: false, reason: "forbidden" });
  });

  /** Google answers an invalid key with 400 and `API_KEY_INVALID`, not with 401. */
  it("reads Google's 400 API_KEY_INVALID as rejected", async () => {
    const body = '{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT"}}';
    const verdict = await verifyProviderKey("google", KEY, recording(400, body).impl);
    expect(verdict).toMatchObject({ ok: false, reason: "rejected" });
  });

  /** A 400 that is not about the key is not a rejection, and must not delete somebody's key. */
  it("reads an unrelated 400 as a provider error rather than a rejection", async () => {
    const verdict = await verifyProviderKey("google", KEY, recording(400, '{"error":"pageSize too large"}').impl);
    expect(verdict).toMatchObject({ ok: false, reason: "provider_error" });
  });

  /**
   * 429 proves the key is real: the account is rate limited, which only happens to a key the
   * provider recognises. Refusing to store it would be exactly backwards.
   */
  it("treats a rate limit as proof the key works", async () => {
    const verdict = await verifyProviderKey("anthropic", KEY, recording(429, "slow down").impl);
    expect(verdict.ok).toBe(true);
  });

  it("treats 5xx and a thrown fetch as unreachable, which says nothing about the key", async () => {
    expect(await verifyProviderKey("openai", KEY, recording(503).impl)).toMatchObject({
      ok: false,
      reason: "unreachable",
    });

    const throwing: FetchLike = async () => {
      throw new Error("getaddrinfo ENOTFOUND api.openai.com");
    };
    expect(await verifyProviderKey("openai", KEY, throwing)).toMatchObject({ ok: false, reason: "unreachable" });
  });

  it("gives up rather than hanging a form open forever", async () => {
    const never: FetchLike = () => new Promise(() => {});
    const verdict = await verifyProviderKey("openai", KEY, never, 20);
    expect(verdict).toMatchObject({ ok: false, reason: "unreachable" });
    expect(verdict.ok === false && verdict.detail).toContain("20ms");
  });

  it("refuses something that cannot be a key without asking anybody", async () => {
    const { seen, impl } = recording(200);
    const verdict = await verifyProviderKey("openai", "   ", impl);
    expect(verdict).toMatchObject({ ok: false, reason: "rejected" });
    expect(seen).toHaveLength(0);
  });

  /** The detail is bounded, because a provider may answer a failure with an HTML error page. */
  it("bounds what it will carry out of a provider's body", async () => {
    const verdict = await verifyProviderKey("openai", KEY, recording(401, "x".repeat(5_000)).impl);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok === false && verdict.detail.length).toBeLessThanOrEqual(300);
  });
});

describe("refusalWords", () => {
  it("names the provider in every refusal, because that is what a person acts on", () => {
    for (const reason of ["rejected", "forbidden", "unreachable", "provider_error"] as const) {
      expect(refusalWords("openai", reason, "OpenAI")).toContain("OpenAI");
      expect(refusalWords("openai", reason, "OpenAI")).toContain("Nothing was saved");
    }
  });
});

/**
 * The seam, and the three guards.
 *
 * **This exists because the first version of EPIC-042 put the fake in `apps/web` only**, and the
 * e2e suite then made a real HTTPS call to `api.anthropic.com` from the worker's "test this stored
 * key" job. A seam in one of two callers is not a seam, so it moved here, and these are the tests
 * that keep it here.
 */
describe("verifyProviderKeyOrFake", () => {
  const FAKE_ON = { FAKE_PROVIDER: "1", DEPLOY_ENV: "development" };

  it("calls nobody when the fake is on, and says that it did not", async () => {
    const { seen, impl } = recording(200);
    const outcome = await verifyProviderKeyOrFake("anthropic", KEY, { env: FAKE_ON, fetchImpl: impl });
    expect(outcome.verdict.ok).toBe(true);
    expect(outcome.usedFake).toBe(true);
    expect(seen).toHaveLength(0);
  });

  it("rejects a key carrying the marker, so a test can have a refusal on demand", async () => {
    const outcome = await verifyProviderKeyOrFake("openai", `${FAKE_REJECTED_PREFIX}whatever`, { env: FAKE_ON });
    expect(outcome.verdict).toMatchObject({ ok: false, reason: "rejected" });
  });

  it("is off unless the flag is exactly 1", async () => {
    for (const flag of [undefined, "0", "true", ""]) {
      expect(verificationIsFaked({ ...(flag === undefined ? {} : { FAKE_PROVIDER: flag }) })).toBe(false);
    }
    expect(verificationIsFaked(FAKE_ON)).toBe(true);
  });

  it("is refused in production, whatever the flag says", async () => {
    expect(verificationIsFaked({ FAKE_PROVIDER: "1", DEPLOY_ENV: "production" })).toBe(false);

    const { seen, impl } = recording(200);
    const outcome = await verifyProviderKeyOrFake("openai", KEY, {
      env: { FAKE_PROVIDER: "1", DEPLOY_ENV: "production" },
      fetchImpl: impl,
    });
    // It really did ask the provider, which is the whole assertion.
    expect(outcome.usedFake).toBe(false);
    expect(seen).toHaveLength(1);
  });

  it("announces itself, so a caller can log it", async () => {
    expect((await verifyProviderKeyOrFake("google", KEY, { env: FAKE_ON })).usedFake).toBe(true);
    const { impl } = recording(200);
    expect((await verifyProviderKeyOrFake("google", KEY, { env: {}, fetchImpl: impl })).usedFake).toBe(false);
  });
});
