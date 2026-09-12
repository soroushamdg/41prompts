import { describe, expect, it } from "vitest";
import { sessionCookiePrefix } from "./cookie-prefix";

/**
 * The property that matters is not what any one prefix is — it is that **no two deployments under
 * one parent domain can produce the same cookie name.** Production's cookie is scoped
 * `.41prompts.ai`, which reaches every subdomain including staging's, so identical names meant the
 * browser sent two cookies called `__Secure-41prompts.session_token` to staging and one silently
 * won. These assert the collision back out of existence.
 */
describe("sessionCookiePrefix", () => {
  it("keeps the bare name in production, so live sessions survive the deploy", () => {
    expect(sessionCookiePrefix("production")).toBe("41prompts");
  });

  it("gives staging a different name from production — the whole fix", () => {
    expect(sessionCookiePrefix("staging")).toBe("41prompts-staging");
    expect(sessionCookiePrefix("staging")).not.toBe(sessionCookiePrefix("production"));
  });

  it("gives every environment a distinct name, including ones that do not exist yet", () => {
    const envs = ["production", "staging", "development", "preview", "review-42"];
    const prefixes = envs.map((env) => sessionCookiePrefix(env));
    expect(new Set(prefixes).size).toBe(envs.length);
  });

  /**
   * Better Auth reads `${prefix}.${name}` and falls back to `${prefix}-${name}`. A prefix that made
   * one deployment's fallback name equal another's primary name would reintroduce the collision
   * through the back door, so both forms are checked against each other.
   */
  it("does not collide through Better Auth's dot-or-dash fallback either", () => {
    const names = (env: string) => {
      const prefix = sessionCookiePrefix(env);
      return [`${prefix}.session_token`, `${prefix}-session_token`];
    };
    const production = names("production");
    for (const env of ["staging", "development", "preview"]) {
      for (const candidate of names(env)) {
        expect(production, `${env} collides with production on ${candidate}`).not.toContain(candidate);
      }
    }
  });

  it("treats an unset or empty DEPLOY_ENV as development, never as production", () => {
    // Failing open to production would hand a local or misconfigured deployment the bare name and
    // put the collision straight back.
    expect(sessionCookiePrefix(undefined)).toBe("41prompts-development");
    expect(sessionCookiePrefix("")).toBe("41prompts-development");
  });
});
