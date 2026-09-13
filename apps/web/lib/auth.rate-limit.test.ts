import { describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip } from "@41prompts/db";
import { getAuth } from "./auth";

async function requestMagicLink(email: string): Promise<void> {
  await getAuth().api.signInMagicLink({
    body: { email, callbackURL: "/app" },
    headers: new Headers({ origin: "http://localhost:3000" }),
  });
}

// `auth.api.signInMagicLink` calls the endpoint handler directly and skips the HTTP router —
// which is where the plugin's own IP-keyed limiter lives, so it never sees these calls at all
// (confirmed directly: looping this same call past the configured max never throws). The
// custom per-email `hooks.before` check in lib/auth.ts runs at endpoint dispatch either way, so
// it's exercised correctly above. The IP limit needs a real HTTP request, so this goes through
// `auth.handler` — the same function `toNextJsHandler` wraps for the real route — instead.
async function postMagicLinkOverHttp(email: string): Promise<Response> {
  return getAuth().handler(
    new Request("http://localhost:3000/api/auth/sign-in/magic-link", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "http://localhost:3000" },
      body: JSON.stringify({ email, callbackURL: "/app" }),
    }),
  );
}

announceDatabaseSkip("magic-link rate limiting");

describe.skipIf(!HAS_TEST_DATABASE)("magic-link rate limiting", () => {
  it("returns a clear message once the same email is requested too often", async () => {
    const email = `rate-email-${Date.now()}@example.com`;

    for (let i = 0; i < 3; i += 1) {
      await requestMagicLink(email);
    }

    await expect(requestMagicLink(email)).rejects.toMatchObject({
      body: { message: expect.stringContaining("Too many sign-in links requested for this email") },
    });
  });

  it("returns a clear message once one source sends too many requests overall", async () => {
    for (let i = 0; i < 20; i += 1) {
      await postMagicLinkOverHttp(`rate-ip-${i}-${Date.now()}@example.com`);
    }

    const response = await postMagicLinkOverHttp(`rate-ip-final-${Date.now()}@example.com`);
    expect(response.status).toBe(429);
  });
});
