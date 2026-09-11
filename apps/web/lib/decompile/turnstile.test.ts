import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetTurnstileWarningForTest,
  turnstileConfigured,
  turnstileSiteKey,
  verifyTurnstile
} from "./turnstile";

/**
 * EPIC-014 asked for two test names as evidence that "Turnstile guards permalink creation and
 * nothing else" and got none — the criterion was ticked on a reading of the code. This file is the
 * evidence, written after the half-configured state took sharing down on staging (2026-09-11).
 */

const SITE_KEY = "NEXT_PUBLIC_TURNSTILE_SITE_KEY";
const SECRET_KEY = "TURNSTILE_SECRET_KEY";
const originals = { site: process.env[SITE_KEY], secret: process.env[SECRET_KEY] };

function setKeys({ site, secret }: { site?: string; secret?: string }) {
  if (site === undefined) delete process.env[SITE_KEY];
  else process.env[SITE_KEY] = site;
  if (secret === undefined) delete process.env[SECRET_KEY];
  else process.env[SECRET_KEY] = secret;
  resetTurnstileWarningForTest();
}

beforeEach(() => setKeys({}));

afterEach(() => {
  setKeys({ site: originals.site, secret: originals.secret });
  vi.restoreAllMocks();
});

const succeeds: typeof fetch = async () => new Response(JSON.stringify({ success: true }));
const fails: typeof fetch = async () => new Response(JSON.stringify({ success: false }));
const unreachable: typeof fetch = async () => {
  throw new Error("getaddrinfo ENOTFOUND challenges.cloudflare.com");
};

describe("both keys, or Turnstile is off", () => {
  it("renders no widget and skips verification when neither key is set", async () => {
    expect(turnstileConfigured()).toBe(false);
    expect(turnstileSiteKey()).toBeNull();
    await expect(verifyTurnstile({ token: null })).resolves.toEqual({ ok: true, checked: false });
  });

  it("does not refuse every share when only the secret is set", async () => {
    // The staging outage, as a test. The widget cannot render without a site key, so no token is
    // ever sent; before this fix the server refused the empty token and sharing was dead for
    // everyone, with a message that blamed the reader for a challenge they never saw.
    setKeys({ secret: "secret-only" });

    expect(turnstileSiteKey()).toBeNull();
    expect(turnstileConfigured()).toBe(false);
    await expect(verifyTurnstile({ token: null })).resolves.toEqual({ ok: true, checked: false });
  });

  it("renders no widget when only the site key is set", async () => {
    // The mirror image: a challenge nobody verifies costs the reader a puzzle and buys nothing.
    setKeys({ site: "site-only" });

    expect(turnstileSiteKey()).toBeNull();
    expect(turnstileConfigured()).toBe(false);
    await expect(verifyTurnstile({ token: "anything" })).resolves.toEqual({ ok: true, checked: false });
  });

  it("says which variable is missing, once, at error level", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    // The complaint is suppressed under test by design, so this is the one place that lifts it.
    vi.stubEnv("NODE_ENV", "production");
    try {
      setKeys({ secret: "secret-only" });
      turnstileConfigured();
      turnstileConfigured();

      expect(error).toHaveBeenCalledTimes(1);
      expect(error.mock.calls[0]?.[0]).toContain(SITE_KEY);
      expect(error.mock.calls[0]?.[0]).toContain("Turnstile is OFF");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("is on only when both are set", () => {
    setKeys({ site: "site", secret: "secret" });
    expect(turnstileConfigured()).toBe(true);
    expect(turnstileSiteKey()).toBe("site");
  });

  it("treats an empty string as unset, which is how a dashboard stores a cleared field", () => {
    setKeys({ site: "", secret: "secret" });
    expect(turnstileConfigured()).toBe(false);
  });
});

describe("when it is on, it verifies", () => {
  beforeEach(() => setKeys({ site: "site", secret: "secret" }));

  it("passes a valid token and reports that a human was actually checked", async () => {
    await expect(verifyTurnstile({ token: "good", fetchImpl: succeeds })).resolves.toEqual({
      ok: true,
      checked: true
    });
  });

  it("refuses a missing token without calling Cloudflare", async () => {
    const fetchImpl = vi.fn(succeeds);
    const result = await verifyTurnstile({ token: "", fetchImpl });
    expect(result.ok).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refuses a token Cloudflare rejects, and never blames the reader", async () => {
    const result = await verifyTurnstile({ token: "stale", fetchImpl: fails });
    expect(result).toEqual({ ok: false, message: "That check expired before the link was made. Try sharing again." });
  });

  it("fails open when Cloudflare is unreachable, and says nobody was checked", async () => {
    // Their outage must not become ours: the rate limits still bound an unchecked caller.
    await expect(verifyTurnstile({ token: "good", fetchImpl: unreachable })).resolves.toEqual({
      ok: true,
      checked: false
    });
  });

  it("sends the secret and the caller's address, and only those", async () => {
    const fetchImpl = vi.fn(succeeds);
    await verifyTurnstile({ token: "good", remoteIp: "203.0.113.7", fetchImpl });

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const sent = new URLSearchParams(String(init?.body));
    expect(sent.get("secret")).toBe("secret");
    expect(sent.get("response")).toBe("good");
    expect(sent.get("remoteip")).toBe("203.0.113.7");
  });

  it("omits remoteip rather than sending an empty one when the address is unknown", async () => {
    const fetchImpl = vi.fn(succeeds);
    await verifyTurnstile({ token: "good", remoteIp: null, fetchImpl });
    expect(new URLSearchParams(String(fetchImpl.mock.calls[0]?.[1]?.body)).has("remoteip")).toBe(false);
  });
});

describe("it guards permalink creation and nothing else", () => {
  it("is reached from share-actions and from no other action on the route", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const routeDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "decompile");

    const actions = readFileSync(join(routeDir, "share-actions.ts"), "utf-8");
    const withoutComments = actions.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/gm, " ");

    // Exactly one call, and it is inside shareDecompile — not joinWaitlist, not removeDecompile.
    expect(withoutComments.match(/verifyTurnstile\(/g)).toHaveLength(1);
    const share = withoutComments.slice(
      withoutComments.indexOf("export async function shareDecompile"),
      withoutComments.indexOf("export async function removeDecompile")
    );
    expect(share).toContain("verifyTurnstile(");
  });

  it("is not imported by the decompile action, so decompiling never waits on Cloudflare", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const routeDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app", "decompile");

    const actions = readFileSync(join(routeDir, "actions.ts"), "utf-8");
    expect(actions).not.toContain("turnstile");
  });
});
