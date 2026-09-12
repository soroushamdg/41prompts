import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sessionCookieConfig } from "./auth";

const original = process.env.SESSION_COOKIE_DOMAIN;

beforeEach(() => delete process.env.SESSION_COOKIE_DOMAIN);
afterEach(() => {
  if (original === undefined) delete process.env.SESSION_COOKIE_DOMAIN;
  else process.env.SESSION_COOKIE_DOMAIN = original;
});

/**
 * The session cookie is scoped to a parent domain so the apex can see a session created on `app.`,
 * which is what lets the landing nav say "Go to dashboard" without a flash of the wrong answer.
 *
 * **What this widens, pinned rather than assumed:** every host under that domain now receives the
 * session cookie. `infra/README.md` carries the same warning beside the DNS records.
 */
describe("the session cookie's domain", () => {
  it("is host-only when nothing is configured, which is local development", () => {
    expect(sessionCookieConfig()).toBeUndefined();
  });

  it("is the parent domain when configured", () => {
    process.env.SESSION_COOKIE_DOMAIN = ".41prompts.ai";
    expect(sessionCookieConfig()).toEqual({ enabled: true, domain: ".41prompts.ai" });
  });

  it("treats an empty value as unset rather than as an empty domain", () => {
    // A dashboard stores a cleared field as "", and `{ enabled: true, domain: "" }` would fail
    // inside Better Auth at request time rather than at start-up.
    process.env.SESSION_COOKIE_DOMAIN = "";
    expect(sessionCookieConfig()).toBeUndefined();
  });

  it("keeps staging's cookie off the production apex", () => {
    // Staging is itself a subdomain of 41prompts.ai, so scoping it to the *shared* parent would put
    // a staging session cookie on the production hosts under the same name, and signing in on one
    // would overwrite the other. Scoping it one level down keeps them apart. (Production's cookie
    // still reaches staging — that direction is unavoidable and is documented.)
    process.env.SESSION_COOKIE_DOMAIN = ".staging.41prompts.ai";
    expect(sessionCookieConfig()!.domain).toBe(".staging.41prompts.ai");
  });
});
