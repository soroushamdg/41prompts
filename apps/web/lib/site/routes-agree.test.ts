import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ALL_FOOTER_LINKS, INDEXED_ROUTES, NAV_LINKS, NOT_INDEXED_ROUTES, PUBLIC_ROUTES } from "./links";

/**
 * Four files decide what the public site is, and this is what stops them disagreeing.
 *
 * - `lib/site/public-routes.json` — the routes, and which are deliberately out of search.
 * - `app/sitemap.ts` — what a crawler is told to fetch.
 * - `app/robots.ts` — what a crawler is told to skip.
 * - `scripts/lighthouse-site.mjs` — what gets measured.
 *
 * **They were already out of step before this test existed.** EPIC-072 shipped six pages that were
 * live, linked from the nav, and absent from `sitemap.ts` — which listed its routes by hand. A page
 * a crawler starting from the sitemap never sees is a page that, for search purposes, was not
 * shipped. Deriving the sitemap fixed that instance; this fixes the class.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const APP_DIR = join(REPO_ROOT, "apps", "web", "app");

vi.mock("@/lib/site/url", () => ({ siteOrigin: async () => "https://41prompts.ai" }));

const { default: sitemap } = await import("../../app/sitemap.js");
const { default: robots } = await import("../../app/robots.js");

describe("the route list is the truth and everything derives from it", () => {
  it("has both halves, so nothing below is vacuous", () => {
    expect(INDEXED_ROUTES.length).toBeGreaterThan(10);
    expect(NOT_INDEXED_ROUTES.length).toBeGreaterThan(0);
    expect(PUBLIC_ROUTES.length).toBe(INDEXED_ROUTES.length + NOT_INDEXED_ROUTES.length);
  });

  it("names no route twice", () => {
    expect(new Set(PUBLIC_ROUTES).size).toBe(PUBLIC_ROUTES.length);
  });

  it.each(PUBLIC_ROUTES)("%s has a page on disk", (route) => {
    const segments = route.split("/").filter(Boolean);
    const direct = join(APP_DIR, ...segments, "page.tsx");
    const dynamicLegal = segments[0] === "legal" && existsSync(join(APP_DIR, "legal", "[slug]", "page.tsx"));
    expect(existsSync(direct) || dynamicLegal, `${route} has no page.tsx`).toBe(true);
  });
});

describe("the sitemap lists every indexed page and nothing else", () => {
  it("covers all of them", async () => {
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    for (const route of INDEXED_ROUTES) expect(urls, `${route} is missing from the sitemap`).toContain(route);
  });

  it("lists nothing we told crawlers to skip", async () => {
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    for (const route of NOT_INDEXED_ROUTES) {
      expect(urls, `${route} is disallowed in robots.txt and listed in the sitemap`).not.toContain(route);
    }
  });

  it("would have caught the EPIC-072 gap", async () => {
    // The control, named after the defect it exists to prevent: six live pages, none in the sitemap.
    const urls = (await sitemap()).map((entry) => new URL(entry.url).pathname);
    for (const route of ["/features", "/delivery", "/docs", "/security", "/changelog", "/guides"]) {
      expect(urls).toContain(route);
    }
  });

  it("gives every entry a priority and a change frequency", async () => {
    for (const entry of await sitemap()) {
      expect(entry.priority, entry.url).toBeGreaterThan(0);
      expect(entry.changeFrequency, entry.url).toBeTruthy();
    }
  });
});

describe("robots.txt and the route list agree", () => {
  it("disallows every route we said is not indexed", async () => {
    const rule = (await robots()).rules;
    const disallow = (Array.isArray(rule) ? rule[0]?.disallow : rule?.disallow) ?? [];
    const list = Array.isArray(disallow) ? disallow : [disallow];
    for (const route of NOT_INDEXED_ROUTES) {
      expect(list, `${route} is marked not indexed and robots.txt does not disallow it`).toContain(route);
    }
  });

  it("disallows no route we said is indexed", async () => {
    const rule = (await robots()).rules;
    const disallow = (Array.isArray(rule) ? rule[0]?.disallow : rule?.disallow) ?? [];
    const list = (Array.isArray(disallow) ? disallow : [disallow]).filter(Boolean) as string[];
    for (const route of INDEXED_ROUTES) {
      const blocked = list.some((prefix) => route === prefix || route.startsWith(prefix));
      expect(blocked, `${route} is meant to be indexed and robots.txt disallows it via a prefix`).toBe(false);
    }
  });

  it("points at the sitemap", async () => {
    expect((await robots()).sitemap).toContain("/sitemap.xml");
  });
});

describe("the Lighthouse runner reads the same file", () => {
  const script = readFileSync(join(REPO_ROOT, "scripts", "lighthouse-site.mjs"), "utf8");

  it("reads public-routes.json rather than holding its own copy", () => {
    expect(script).toContain("public-routes.json");
  });

  /**
   * The control, and the reason this test exists at all.
   *
   * The first version of that script carried a `FALLBACK_ROUTES` array — a copy of this list, one
   * edit away from being wrong, in the one place where being wrong looks like a pass. If a literal
   * route list ever comes back, this fails.
   */
  it("holds no literal route list of its own", () => {
    const literals = [...script.matchAll(/"\/(?:features|delivery|docs|security|changelog|guides|decompile)"/g)];
    expect(literals.map((m) => m[0]), "the Lighthouse script has grown its own copy of the routes").toEqual([]);
  });
});

describe("the chrome only points at routes that exist", () => {
  it.each([...NAV_LINKS, ...ALL_FOOTER_LINKS].map((link) => [link.name, link.href] as const))(
    "%s → %s is a public route",
    (_name, href) => {
      expect(PUBLIC_ROUTES, `${href} is linked from the chrome and is not a public route`).toContain(href);
    }
  );
});
