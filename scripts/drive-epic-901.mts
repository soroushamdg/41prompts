/**
 * EPIC-901's drive: the BUILT app on localhost, after 96 files changed licence header.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3119)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/901.env
 *   set -a && . /tmp/901.env && set +a
 *   pnpm --filter @41prompts/web start --port 3119 &
 *   npx tsx scripts/drive-epic-901.mts
 *
 * ## This epic ships no route and no user-visible string, and the drive is still not a formality
 *
 * `docs/AUTONOMOUS.md` says a worker-only or core-only epic says so in its report rather than
 * claiming a drive that did not happen, and EPIC-901's report §9 does. But this epic is not
 * worker-only: it **rewrote the first three lines of 96 files**, two of which are inside
 * `apps/web`, and added `.githooks/**` to `REUSE.toml`. A test suite that passes proves the
 * modules still parse. It does not prove the application still builds and serves — that is exactly
 * the gap `docs/PROCESS.md`'s twenty-epic outage lived in, where 151 Playwright assertions were
 * green while the deployed `/app` rendered as unstyled text.
 *
 * So the claim this drive makes is narrow and it is stated narrowly: **the built app still serves
 * every public page, styled, and a person who has never signed in can sign in and create a
 * project.** It is not a demonstration of a feature, because this epic has none.
 *
 * Five things a test cannot do, and one of them is the reason the drive exists at all:
 *
 * 1. **The server answering is the build just made.** `/healthz` says `"commit":"unknown"` with no
 *    `COMMIT_SHA`, so it cannot identify a local build. `apps/web/.next/BUILD_ID` appears verbatim
 *    in the HTML and can. EPIC-052's drive did this first (lesson 17).
 * 2. **The stylesheet the page links is real CSS**, fetched and measured — not "a `<link>` exists".
 *    This is the 2026-09-13 failure, which a dev server cannot reproduce and a built app can.
 * 3. **No public page scrolls sideways at 390px.** EPIC-072 found the nav 185px past the viewport
 *    on *every* public page, and no assertion in three spec files noticed.
 * 4. **`/legal/third-party-notices` still lists dependencies.** It is the one page in the product
 *    whose subject is licensing, and this epic changed `ALLOWED_LICENSES`. The generator reads
 *    `pnpm licenses list --prod` and does not consult that set — so the expected result is "no
 *    change", and confirming a no-change is the whole point of checking.
 * 5. **A fresh account reaches the workbench and creates a project through the UI.** `/app` was a
 *    dead end for three epics and a test asserted the dead end as correct. A public-pages-only
 *    drive would not notice a build that cannot serve the application at all.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, and migrations against the real database.
 * Nothing is pushed (`CLAUDE.md`, "Nothing is pushed"), so nothing deploys and no staging URL is
 * evidence about any of this. It also covers none of the audit itself — `pnpm audit-run`,
 * `pnpm license-gate` and `apps/web/audit.test.ts` are where that lives, and none of it renders.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and the account is cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3119";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-901");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-901-${Date.now()}@example.com`;

/** The route table, read from the file that owns it — EPIC-072 lesson 1. */
const routeTable = JSON.parse(readFileSync(join(ROOT, "apps/web/lib/site/public-routes.json"), "utf-8")) as {
  indexed: string[];
  notIndexed: string[];
};
// `/sign-in` and `/sign-up` render no nav and are driven by section 5 rather than swept here.
const ROUTES = [...routeTable.indexed, ...routeTable.notIndexed].filter((p) => p !== "/sign-in" && p !== "/sign-up");

const results: { name: string; ok: boolean; detail: string }[] = [];
const transcript: string[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`;
  transcript.push(line);
  console.log(line);
};

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 15_000 });
  const token = await magicLinkTokenFor(EMAIL);
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/app/projects`);
  await page.waitForURL(/\/app\/projects/, { timeout: 20_000 });
}

console.log(`cleaned up ${await deleteDriveUsers()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // ── 0. The server answering is the build just made ─────────────────────────────────────────────

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const html = await page.content();
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && html.includes(buildId),
    `BUILD_ID ${buildId} ${html.includes(buildId) ? "is" : "is NOT"} in the HTML`,
  );

  // ── 1. Every public route serves, and its stylesheet is real CSS ───────────────────────────────

  for (const path of ROUTES) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const href = await page.locator('link[rel="stylesheet"]').first().getAttribute("href");
    const css = href ? await (await page.request.get(new URL(href, BASE).href)).text() : "";
    // A dev server serves CSS from memory and generates every chunk on request, so it cannot fail
    // this way. A built app can, and once did, on every page at once.
    const looksLikeCss = css.length > 1000 && /[{;]/.test(css);
    record(
      `${path} serves, styled`,
      response?.status() === 200 && looksLikeCss,
      `${response?.status()} · stylesheet ${href ? `${css.length} bytes` : "MISSING"}`,
    );
  }

  // ── 2. Nothing scrolls sideways on a phone ─────────────────────────────────────────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ROUTES) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    record(`${path} does not scroll sideways at 390px`, overflow <= 0, `overflow ${overflow}px`);
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  // ── 3. The one page in the product whose subject is licensing ──────────────────────────────────

  await page.goto(`${BASE}/legal/third-party-notices`, { waitUntil: "networkidle" });
  const notices = await page.locator("main").innerText();
  const licences = ["MIT", "Apache-2.0", "ISC"].filter((l) => notices.includes(l));
  record(
    "/legal/third-party-notices still lists dependencies and their licences",
    notices.length > 2000 && licences.length === 3,
    `${notices.length} characters, names ${licences.join(", ")}`,
  );
  await page.screenshot({ path: join(SHOTS, "third-party-notices.png"), fullPage: false });

  // ── 4. Dark mode, because a token that resolves wrongly is invisible to every text assertion ───

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const rgb = background.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  const isDark = (rgb[0] ?? 255) + (rgb[1] ?? 255) + (rgb[2] ?? 255) < 300;
  record("the landing page is dark in dark mode", isDark, `body background ${background}`);
  await page.screenshot({ path: join(SHOTS, "landing-dark.png"), fullPage: false });
  await page.emulateMedia({ colorScheme: "light" });

  // ── 5. A fresh account signs in and creates a project through the UI ───────────────────────────
  //
  // `docs/AUTONOMOUS.md`: build the data through the product's own UI, never by seeding. Driving
  // the creation path is part of the test — it is how you find out that the path a real user takes
  // is broken.

  await signIn(page);
  record("a fresh account reaches the workbench", page.url().includes("/app/projects"), page.url());
  await page.screenshot({ path: join(SHOTS, "projects-empty.png"), fullPage: false });

  const name = `Audit drive ${new Date().toISOString().slice(0, 10)}`;
  await page.getByLabel("New project").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\//, { timeout: 20_000 });
  const heading = await page.getByRole("heading", { level: 1 }).first().textContent();
  record("creating a project through the UI works", (heading ?? "").includes(name), `heading ${JSON.stringify(heading)}`);
  await page.screenshot({ path: join(SHOTS, "project-created.png"), fullPage: false });
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) on the way out`);
}

const passed = results.filter((r) => r.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
