#!/usr/bin/env node
// EPIC-072, `docs/roadmap.md`'s Tests line: **"Lighthouse ≥ 90 all pages"**.
//
// Nothing else in this repository measures performance, best practices or SEO on a rendered page.
// `@axe-core/playwright` covers accessibility inside the e2e suite and is the stricter instrument
// for that one category; the other three had no instrument at all.
//
// **It is not in `scripts/gates.mjs`, deliberately.** Lighthouse needs a server and a real Chrome,
// and a full pass over seventeen routes takes minutes — `docs/PROCESS.md`'s measured argument about
// the e2e container applies unchanged: a gate nobody runs because it is slow covers nothing. This is
// run by hand against the built app during the epic's drive, and its numbers go in the report.
//
//   turbo run build --filter=@41prompts/web
//   (cd apps/web && npx next start -p 3111)
//   node scripts/lighthouse-site.mjs http://127.0.0.1:3111
//
// Exits non-zero if any category on any page is below the bar, so it can be believed from its exit
// code rather than from somebody reading the table (`docs/PROCESS.md` lesson 33).
import { createRequire } from "node:module";

const require = createRequire(new URL("../apps/web/package.json", import.meta.url));
const lighthouse = (await import(require.resolve("lighthouse"))).default;
const { launch } = await import(require.resolve("chrome-launcher"));

const { PUBLIC_ROUTES } = await import("../apps/web/lib/site/links.ts").catch(() => ({ PUBLIC_ROUTES: null }));

/**
 * The routes, read from the same table the chrome renders where possible.
 *
 * `links.ts` is TypeScript, so a plain `import` of it works only under a loader. When it does not,
 * this falls back to the literal list — and prints which it used, because a run over three routes
 * that reports a pass is the shape of failure this whole file exists to avoid.
 */
const FALLBACK_ROUTES = [
  "/",
  "/features",
  "/delivery",
  "/docs",
  "/security",
  "/changelog",
  "/guides",
  "/guides/what-your-prompt-does-not-check",
  "/decompile",
  "/contact",
  "/sign-in",
  "/sign-up",
  "/legal/terms",
  "/legal/privacy",
  "/legal/security",
  "/legal/sub-processors",
  "/legal/third-party-notices",
];

const BAR = Number(process.env.LIGHTHOUSE_BAR ?? 90);
const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"];

const base = (process.argv[2] ?? "http://127.0.0.1:3111").replace(/\/$/, "");
const routes = PUBLIC_ROUTES ?? FALLBACK_ROUTES;
console.log(`Lighthouse over ${routes.length} routes at ${base}, bar ${BAR}`);
console.log(PUBLIC_ROUTES ? "routes: from apps/web/lib/site/links.ts" : "routes: from this file's fallback list");

const chrome = await launch({ chromeFlags: ["--headless=new", "--no-sandbox"] });
const rows = [];
let failures = 0;

try {
  for (const route of routes) {
    const result = await lighthouse(
      `${base}${route}`,
      { port: chrome.port, output: "json", logLevel: "error" },
      undefined,
    );
    const scores = {};
    for (const category of CATEGORIES) {
      scores[category] = Math.round((result.lhr.categories[category]?.score ?? 0) * 100);
      if (scores[category] < BAR) failures += 1;
    }
    rows.push({ route, ...scores });
    const flags = CATEGORIES.map((c) => `${c[0].toUpperCase()}${scores[c]}`).join(" ");
    console.log(`  ${scores.performance >= BAR && scores.accessibility >= BAR && scores["best-practices"] >= BAR && scores.seo >= BAR ? "ok  " : "BELOW"} ${route.padEnd(42)} ${flags}`);
  }
} finally {
  await chrome.kill();
}

console.log("\n| route | performance | accessibility | best practices | SEO |");
console.log("|---|---|---|---|---|");
for (const row of rows) {
  console.log(`| \`${row.route}\` | ${row.performance} | ${row.accessibility} | ${row["best-practices"]} | ${row.seo} |`);
}

if (failures > 0) {
  console.error(`\n${failures} category score(s) below ${BAR}.`);
  process.exit(1);
}
console.log(`\nEvery category on every route is at or above ${BAR}.`);
