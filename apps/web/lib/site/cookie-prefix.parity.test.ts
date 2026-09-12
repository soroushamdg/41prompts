import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **The gate and the setter must look for the same name.**
 *
 * `proxy.ts` decides whether a request even reaches a page; `lib/auth.ts` decides what the cookie is
 * called. If those two ever disagree, every `/app/*` request is bounced to sign-in while a perfectly
 * valid session sits in the browser — which is exactly the outage this epic's PR was fixing, arriving
 * from the other direction.
 *
 * Asserted on the source rather than by calling both, because the failure is somebody hard-coding a
 * literal in one of them again.
 */
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

describe("the proxy gate and the auth config agree on the cookie name", () => {
  it.each([
    ["proxy.ts", join(webRoot, "proxy.ts")],
    ["lib/auth.ts", join(webRoot, "lib", "auth.ts")],
  ])("%s derives the prefix rather than hard-coding it", (_name, file) => {
    const source = readFileSync(file, "utf-8");
    expect(source).toContain("sessionCookiePrefix()");
    expect(source, "a hard-coded prefix is how the two drift apart").not.toMatch(
      /cookiePrefix:\s*["'`]/
    );
  });
});
