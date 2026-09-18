#!/usr/bin/env node
// EPIC-072, `docs/roadmap.md`'s Tests line: **"Lighthouse ≥ 90 all pages"**.
//
// Nothing else in this repository measures performance, best practices or SEO on a rendered page.
// `@axe-core/playwright` covers accessibility inside the e2e suite and is the stricter instrument
// for that one category; the other three had no instrument at all.
//
// **It is not in `scripts/gates.mjs`, deliberately.** Lighthouse needs a server and a real browser,
// and a pass over seventeen routes takes minutes — `docs/PROCESS.md`'s measured argument about the
// e2e container applies unchanged: a gate nobody runs because it is slow covers nothing. This is
// run by hand against the built app during the epic's drive, and its numbers go in the report.
//
//   pnpm exec turbo run build --filter=@41prompts/web
//   (cd apps/web && npx next start -p 3111)
//   node scripts/lighthouse-site.mjs http://127.0.0.1:3111
//
// **The browser is Playwright's Chromium, not a separate `chrome-launcher`.** That avoids a second
// new dependency, and it is the better answer anyway: the numbers are then about the same browser
// binary the e2e suite already pins, rather than whatever Chrome happens to be installed.
//
// **The routes come from `apps/web/lib/site/public-routes.json`**, which `lib/site/links.ts`,
// `app/sitemap.ts` and `lib/site/routes-agree.test.ts` also read. A copy of that list in this file
// would go stale the first time somebody adds a page, and the run would report a clean pass over a
// site it had not fully seen. The first draft had exactly such a copy; `routes-agree.test.ts` now
// fails if one comes back.
//
// **Three routes are deliberately not indexed**, and Lighthouse cannot know that. `/contact`,
// `/sign-in` and `/sign-up` have been disallowed in `robots.txt` since EPIC-015 because none is a
// destination for a search result; Lighthouse fails `is-crawlable` on them, which is weight 4 of
// SEO's 11, and scores them 63 to 66. The roadmap's "≥ 90 all pages" cannot be met on those three
// without indexing pages we intend not to index.
//
// So `is-crawlable` is dropped **for those routes only**, and the SEO score recomputed from the
// remaining audits — and the instrument is checked in **both** directions, which is the part that
// matters (`docs/PROCESS.md` lesson 8). A route named as not-indexed that turns out to be crawlable
// fails, because then the name is wrong; and a route *not* named that turns out to be uncrawlable
// fails, because a page silently dropping out of search is exactly the defect this would otherwise
// hide.
//
// Exits non-zero if any category on any page is below the bar, so it can be believed from its exit
// code rather than from somebody reading the table (`docs/PROCESS.md` lesson 33).
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const lighthouse = (await import(require.resolve("lighthouse"))).default;
const playwright = await import(require.resolve("@playwright/test"));
const chromium = playwright.chromium ?? playwright.default.chromium;

const { indexed, notIndexed } = JSON.parse(
  readFileSync(new URL("../apps/web/lib/site/public-routes.json", import.meta.url), "utf8"),
);
const ROUTES = [...indexed, ...notIndexed];
const NOT_INDEXED = new Set(notIndexed);

const BAR = Number(process.env.LIGHTHOUSE_BAR ?? 90);
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];
const DEBUG_PORT = Number(process.env.LIGHTHOUSE_CDP_PORT ?? 9222);

const base = (process.argv[2] ?? "http://127.0.0.1:3111").replace(/\/$/, "");
console.log(`Lighthouse over ${ROUTES.length} routes at ${base}, bar ${BAR}`);

const browser = await chromium.launch({ args: [`--remote-debugging-port=${DEBUG_PORT}`] });
const rows = [];
let failures = 0;

try {
  for (const route of ROUTES) {
    const result = await lighthouse(
      `${base}${route}`,
      { port: DEBUG_PORT, output: "json", logLevel: "error" },
      undefined,
    );
    const scores = {};
    let below = false;
    const crawlable = result.lhr.audits["is-crawlable"];
    const intendedOutOfSearch = NOT_INDEXED.has(route);
    const actuallyBlocked = crawlable?.score !== null && crawlable?.score < 1;

    // Both directions. Neither of these is a score adjustment; each is a disagreement between what
    // the site says it wants and what it serves, and either one is a defect.
    if (intendedOutOfSearch && !actuallyBlocked) {
      console.error(`  WRONG ${route}: named as not indexed, and it is crawlable`);
      failures += 1;
    }
    if (!intendedOutOfSearch && actuallyBlocked) {
      console.error(`  WRONG ${route}: meant to be indexed, and it is blocked from indexing`);
      failures += 1;
    }

    for (const category of CATEGORIES) {
      const lhCategory = result.lhr.categories[category];
      let score = Math.round((lhCategory?.score ?? 0) * 100);
      if (category === "seo" && intendedOutOfSearch && actuallyBlocked) {
        // Recompute from the remaining audits rather than waiving the bar: every other SEO audit
        // still has to pass. Lighthouse's own weighting, minus the one audit whose failure is the
        // intended configuration.
        const refs = (lhCategory?.auditRefs ?? []).filter((ref) => ref.id !== "is-crawlable" && ref.weight > 0);
        const total = refs.reduce((sum, ref) => sum + ref.weight, 0);
        const earned = refs.reduce((sum, ref) => sum + ref.weight * (result.lhr.audits[ref.id]?.score ?? 0), 0);
        score = total > 0 ? Math.round((earned / total) * 100) : 100;
      }
      scores[category] = score;
      if (score < BAR) {
        failures += 1;
        below = true;
      }
    }
    rows.push({ route, ...scores, adjusted: intendedOutOfSearch && actuallyBlocked });
    const flags = CATEGORIES.map((c) => `${c[0].toUpperCase()}${scores[c]}`).join(" ");
    console.log(`  ${below ? "BELOW" : "ok   "} ${route.padEnd(42)} ${flags}${rows.at(-1).adjusted ? "  (SEO without is-crawlable: not indexed on purpose)" : ""}`);
  }
} finally {
  await browser.close();
}

console.log("\n| route | performance | accessibility | best practices | SEO |");
console.log("|---|---|---|---|---|");
for (const row of rows) {
  const note = row.adjusted ? " †" : "";
  console.log(`| \`${row.route}\` | ${row.performance} | ${row.accessibility} | ${row["best-practices"]} | ${row.seo}${note} |`);
}
if (rows.some((row) => row.adjusted)) {
  console.log(
    "\n† SEO recomputed without `is-crawlable`. These routes are disallowed in robots.txt on purpose" +
      " (EPIC-015): they are not destinations for a search result. Every other SEO audit still applies.",
  );
}

if (failures > 0) {
  console.error(`\n${failures} category score(s) below ${BAR}.`);
  process.exit(1);
}
console.log(`\nEvery category on every route is at or above ${BAR}.`);
