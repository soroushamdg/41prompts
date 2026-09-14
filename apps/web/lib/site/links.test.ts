import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALL_FOOTER_LINKS, FOOTER_GROUPS } from "./links";
import { LEGAL_DOC_SLUGS } from "./legal";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "app");

/**
 * The criterion is "every footer link resolves; real page or stub, never a 404", and the e2e suite
 * checks it against a running server. This checks it against the routes on disk, which is the half
 * that fails in review rather than ten minutes into a Playwright run.
 */
function routeExistsFor(href: string): boolean {
  const segments = href.split("/").filter((s) => s.length > 0);
  if (segments.length === 0) return existsSync(join(appDir, "page.tsx"));

  // The literal route, then the one dynamic segment this site actually has.
  if (existsSync(join(appDir, ...segments, "page.tsx"))) return true;
  if (segments[0] === "legal" && segments.length === 2) {
    return LEGAL_DOC_SLUGS.includes(segments[1] ?? "") && existsSync(join(appDir, "legal", "[slug]", "page.tsx"));
  }
  return false;
}

describe("every footer link goes somewhere", () => {
  it("has links at all", () => {
    // Or every assertion below passes vacuously.
    expect(ALL_FOOTER_LINKS.length).toBeGreaterThan(5);
  });

  it.each(ALL_FOOTER_LINKS.map((link) => [link.name, link.href] as const))(
    "%s → %s has a route",
    (_name, href) => {
      expect(routeExistsFor(href), `${href} has no page.tsx`).toBe(true);
    }
  );

  it("links nowhere off-site, because the one off-site link we would want does not exist yet", () => {
    // `github.com/41prompts/41prompts` is already published in packages/core's package.json and in
    // REUSE.toml and answers 404 today. A footer entry pointing at it would be the exact 404 the
    // criterion rules out; EPIC-015 publishes the mirror and adds the link with it.
    for (const link of ALL_FOOTER_LINKS) {
      expect(link.href.startsWith("/"), `${link.name} is off-site`).toBe(true);
    }
  });

  it("gives every group a heading and no duplicate destinations", () => {
    for (const group of FOOTER_GROUPS) {
      expect(group.heading.length).toBeGreaterThan(0);
      expect(group.links.length).toBeGreaterThan(0);
    }
    const hrefs = ALL_FOOTER_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});
