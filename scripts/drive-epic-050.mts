/**
 * EPIC-050's check against the BUILT app on localhost.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with apps/web/e2e/env.mjs's placeholders
 *   npx tsx scripts/drive-epic-050.mts
 *
 * ## This is a build-regression check, not a feature drive, and the report says so
 *
 * EPIC-050 ships **no route, no component and no user-visible string**. It is the EPIC-030 shape,
 * and `docs/AUTONOMOUS.md` is explicit that such an epic says so in its report rather than claiming
 * a drive that did not happen or leaving an unticked box that reads like an omission.
 *
 * What it does still owe is this: the epic changes `packages/core`'s public surface —
 * `artifactOf`'s signature, `index.ts`'s exports, a doc comment in `compile/types.ts` — and
 * `apps/web` compiles against that package and **runs it in the browser** on `/decompile`. A
 * `tsc --noEmit` pass is not the same claim as a production bundle that loads and executes. Twenty
 * epics passed every gate while the deployed `/app` rendered as unstyled text, and the rule that
 * came out of it is that only a built app can fail the way a built app fails.
 *
 * So the three assertions here are the ones only this can make:
 *
 * 1. the landing page renders **styled** — a design token resolves to a real value, rather than the
 *    page merely returning 200;
 * 2. `/decompile` runs `@41prompts/core` in the browser bundle and produces bloks from a pasted
 *    prompt, which is the code path this epic's changes could have broken;
 * 3. the stylesheet the page links is real CSS, fetched separately — the `check-staging` check,
 *    applied locally, because a 200 on the document says nothing about the assets.
 *
 * No sign-in, no test user, and therefore no cleanup: nothing here creates a row. That is a
 * statement about this epic's scope, not a shortcut — `docs/AUTONOMOUS.md`'s fresh-user rule exists
 * for drives that reach signed-in state, and this one has no reason to.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3000";
const SHOTS = join(dirname(fileURLToPath(import.meta.url)), "..", "docs", "epics", "reports", "screenshots", "EPIC-050");
mkdirSync(SHOTS, { recursive: true });

const PROMPT = [
  "You triage inbound support email for Northwind.",
  "",
  "Reply in at most 80 words.",
  "",
  "Never promise a refund. Say that a human will confirm it.",
  "",
  "Respond with valid JSON containing category and needs_human.",
  "",
].join("\n");

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // 1. The landing page, styled.
  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  record("landing responds", landing?.status() === 200, `HTTP ${String(landing?.status())}`);

  // A design token that resolves to a real colour is the thing an unstyled page cannot produce:
  // with no stylesheet applied the custom property is the empty string. Reading the *computed*
  // value rather than a class name, per EPIC-042's lesson.
  //
  // **`--color-ink`, and the first run of this script asked for `--ink`** — which does not exist, so
  // the probe returned "" and reported a styled page as unstyled while the same page's body
  // background was a real colour and its stylesheet was 68 KB of real CSS. That is a false negative,
  // and the cheapest kind of wrong instrument. Hence the control on the next line: a token name that
  // is *deliberately* absent must come back empty, which proves this read can tell the two apart.
  const styled = await page.evaluate(() => ({
    ink: getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim(),
    absent: getComputedStyle(document.documentElement).getPropertyValue("--no-such-token").trim(),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  record(
    "landing is styled, not bare HTML",
    styled.ink !== "" && styled.background !== "rgba(0, 0, 0, 0)",
    `--color-ink = ${JSON.stringify(styled.ink)}, body background = ${styled.background}`,
  );
  record(
    "the token probe can fail: an absent token reads empty",
    styled.absent === "",
    `--no-such-token = ${JSON.stringify(styled.absent)}`,
  );

  // 3. The stylesheet itself, fetched on its own. A document that returns 200 while its CSS 404s is
  // exactly the 2026-09-13 outage, and `scripts/check-staging.mjs` exists because of it.
  const href = await page.evaluate(() => document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]')?.href ?? "");
  const css = href === "" ? undefined : await page.request.get(href);
  const cssBody = css === undefined ? "" : await css.text();
  record(
    "the linked stylesheet is real CSS",
    css?.status() === 200 && cssBody.includes("{") && cssBody.length > 1000,
    href === "" ? "no stylesheet linked" : `${String(css?.status())}, ${cssBody.length} bytes`,
  );

  await page.screenshot({ path: join(SHOTS, "landing-1440.png"), fullPage: false });

  // 2. `packages/core` executing inside the production bundle.
  await page.goto(`${BASE}/decompile`, { waitUntil: "networkidle" });
  await page.getByLabel("Your prompt").fill(PROMPT);
  await page.getByRole("button", { name: "Decompile" }).click();
  await page.getByTestId("source-map").waitFor({ state: "visible", timeout: 15_000 });

  const blokCount = await page.locator(".blok-card").count();
  record("core segments and clusters in the built bundle", blokCount >= 3, `${blokCount} blok cards rendered`);

  const headingVisible = await page.getByRole("heading", { name: "Bloks", exact: true }).isVisible();
  record("the source map renders", headingVisible, headingVisible ? "Bloks heading visible" : "heading missing");

  await page.screenshot({ path: join(SHOTS, "decompile-1440.png"), fullPage: false });

  await page.setViewportSize({ width: 390, height: 844 });
  // Scroll back to the top before the narrow shot. The first run of this produced a 2.7 KB image of
  // nothing: the page was still scrolled to where the 1440 shot left it, and at 390 the layout is
  // taller, so that scroll position is past the end of the content. A screenshot of blank page
  // reads as "the page is broken" or, worse, is filed as evidence and never looked at.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByTestId("source-map").waitFor({ state: "visible" });
  await page.screenshot({ path: join(SHOTS, "decompile-390.png"), fullPage: false });
} finally {
  await browser.close();
}

const failed = results.filter((one) => !one.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
if (failed.length > 0) process.exit(1);
