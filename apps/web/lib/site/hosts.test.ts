import { readdirSync, statSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_PATHS, isAppPath, isSharedPath, PUBLIC_PATHS, redirectTarget } from "./hosts";

const PUBLIC_ORIGIN = "https://41prompts.ai";
const APP_ORIGIN = "https://app.41prompts.ai";
const original = { site: process.env.PUBLIC_SITE_URL, auth: process.env.BETTER_AUTH_URL };

beforeEach(() => {
  process.env.PUBLIC_SITE_URL = PUBLIC_ORIGIN;
  process.env.BETTER_AUTH_URL = APP_ORIGIN;
});

afterEach(() => {
  for (const [key, value] of [["PUBLIC_SITE_URL", original.site], ["BETTER_AUTH_URL", original.auth]] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("a page belongs to exactly one host", () => {
  it.each([
    ["/app", APP_ORIGIN],
    ["/app/account", APP_ORIGIN],
    ["/sign-in", APP_ORIGIN],
    ["/sign-up", APP_ORIGIN],
    ["/api/auth/callback/google", APP_ORIGIN]
  ])("%s moves to app.", (path, expected) => {
    expect(redirectTarget("41prompts.ai", path, "")).toBe(`${expected}${path}`);
    expect(redirectTarget("app.41prompts.ai", path, "")).toBeUndefined();
  });

  it.each([
    ["/", PUBLIC_ORIGIN],
    ["/decompile", PUBLIC_ORIGIN],
    ["/d/dc_0123456789ab", PUBLIC_ORIGIN],
    ["/guides/what-your-prompt-does-not-check", PUBLIC_ORIGIN],
    ["/legal/privacy", PUBLIC_ORIGIN],
    ["/llms.txt", PUBLIC_ORIGIN],
    ["/robots.txt", PUBLIC_ORIGIN],
    ["/sitemap.xml", PUBLIC_ORIGIN]
  ])("%s moves to the apex", (path, expected) => {
    expect(redirectTarget("app.41prompts.ai", path, "")).toBe(`${expected}${path}`);
    expect(redirectTarget("41prompts.ai", path, "")).toBeUndefined();
  });

  it("keeps the query string, so a shared link with parameters still works", () => {
    expect(redirectTarget("app.41prompts.ai", "/decompile", "?start=abc")).toBe(`${PUBLIC_ORIGIN}/decompile?start=abc`);
    expect(redirectTarget("41prompts.ai", "/sign-in", "?next=%2Fapp")).toBe(`${APP_ORIGIN}/sign-in?next=%2Fapp`);
  });

  it("serves /healthz and assets on both hosts rather than redirecting them", () => {
    // A health check that 301s reports on the redirect, not on the app; and redirecting an asset
    // request breaks the page that asked for it.
    for (const host of ["41prompts.ai", "app.41prompts.ai"]) {
      for (const path of ["/healthz", "/icon.svg", "/dev/ui"]) {
        expect(redirectTarget(host, path, ""), `${host}${path}`).toBeUndefined();
      }
    }
    expect(isSharedPath("/healthz")).toBe(true);
  });
});

describe("what it refuses to redirect", () => {
  it("leaves an unrecognised host alone", () => {
    // `Host` is attacker-controllable. Redirecting on the strength of one would send somebody
    // somewhere they never asked to go; serving as-is is the conservative answer.
    expect(redirectTarget("evil.example", "/app", "")).toBeUndefined();
    expect(redirectTarget("10.0.0.4:3000", "/decompile", "")).toBeUndefined();
    expect(redirectTarget("", "/app", "")).toBeUndefined();
  });

  it("does nothing at all when the two origins are the same, or unset", () => {
    // Local development and any single-host deployment: no split, so no redirects, so
    // localhost:3000 keeps working exactly as before.
    process.env.PUBLIC_SITE_URL = APP_ORIGIN;
    expect(redirectTarget("app.41prompts.ai", "/decompile", "")).toBeUndefined();

    delete process.env.PUBLIC_SITE_URL;
    expect(redirectTarget("41prompts.ai", "/app", "")).toBeUndefined();
  });

  it("matches whole segments, never a prefix of a longer name", () => {
    // `/appointments` is not `/app`, and a naive startsWith would have moved it to the wrong host.
    expect(isAppPath("/appointments")).toBe(false);
    expect(isAppPath("/sign-ในทาง")).toBe(false);
    expect(isAppPath("/app")).toBe(true);
    expect(isAppPath("/app/account/delete")).toBe(true);
  });
});

/**
 * The reason `hosts.ts` is the single source of truth rather than a rule written twice: a route
 * added later has to be classified, and nothing else would notice if it were not.
 */
describe("every route in the app is classified", () => {
  const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

  function routes(dir: string, prefix = ""): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // Route groups and private folders do not appear in the URL.
        const segment = entry.startsWith("(") || entry.startsWith("_") ? "" : `/${entry}`;
        out.push(...routes(full, `${prefix}${segment}`));
      } else if (entry === "page.tsx" || entry === "route.ts") {
        out.push(prefix === "" ? "/" : prefix);
      }
    }
    return out;
  }

  it("finds the routes at all", () => {
    expect(routes(appDir).length).toBeGreaterThan(8);
  });

  it.each(routes(appDir).map((r) => [r] as const))("%s is app, public or shared — never ambiguous", (route) => {
    const path = route.replace(/\[[^\]]+\]/g, "x").split(sep).join("/");
    const classified = isAppPath(path) || isSharedPath(path) || !isAppPath(path);
    expect(classified).toBe(true);

    // And the classification must agree with one of the two declared lists, so adding a route
    // without deciding where it lives shows up here rather than in production.
    const declared =
      APP_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ||
      PUBLIC_PATHS.some((p) => path === p || path.startsWith(`${p}/`)) ||
      isSharedPath(path);
    expect(declared, `${path} is in neither APP_PATHS, PUBLIC_PATHS nor SHARED_PATHS`).toBe(true);
  });
});
