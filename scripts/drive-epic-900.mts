/**
 * EPIC-900's drive: the BUILT app on localhost, after 21 dependencies moved and 40 modules lost an
 * `export` keyword.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3120)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/900.env
 *   set -a && . /tmp/900.env && set +a
 *   pnpm --filter @41prompts/web start --port 3120 &
 *   npx tsx scripts/drive-epic-900.mts
 *
 * ## Why a sweep with no feature still gets a drive, and this one more than most
 *
 * `docs/AUTONOMOUS.md` lets a worker-only or core-only epic say so in its report instead of
 * claiming a drive. This epic does not qualify, and the reason is the dependency set rather than
 * the dead code: **React 19.2→19.3, Next 16.3.4→16.3.5 and Better Auth 1.7.2→1.7.5** all moved, and
 * those three are respectively what renders every page, what builds and serves them, and what makes
 * signing in work. A green test suite proves the modules still parse. It does not prove the
 * application still builds and serves, which is the gap the 2026-09-13 outage lived in — 151
 * Playwright assertions green while the deployed `/app` rendered as unstyled text.
 *
 * The 40 de-exports are the quiet half and `tsc` is their control; a keyword removed from a module
 * nothing imported cannot change behaviour. The upgrades are the half a type-checker cannot answer.
 *
 * So the claim is narrow and stated narrowly: **the built app, on the upgraded dependency set,
 * still serves every public page styled, and a person who has never signed in can sign in and
 * create a project.**
 *
 * ## It is watched, not headless
 *
 * Soroush watches the drive happen, so it opens the built app in the IDE preview pane and drives it
 * in a visible browser. `pane()` is fire-and-forget: a missing IDE or a missing bridge extension
 * logs one line and the drive carries on. `DRIVE_HEADLESS=1` must keep working, because `pnpm e2e`
 * and `node scripts/gates.mjs ci` run unattended and must never wait on a window.
 *
 * The pane does not follow the browser on its own — Playwright's session is a different one and our
 * pages do not poll — so `pane(url)` is re-fired at each step worth seeing, which re-points the same
 * Simple Browser panel and refreshes it.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, and migrations against the real database.
 * Nothing is pushed (`CLAUDE.md`, "Nothing is pushed"), so nothing deploys and no staging URL is
 * evidence about any of it. It also covers none of the dead-code gate itself — that is
 * `pnpm dead-code` and `apps/web/dead-code.test.ts`, and none of it renders.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and the account is cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3120";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-900");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-900-${Date.now()}@example.com`;

/**
 * Put the app in the IDE preview pane, so the drive is watched rather than reported.
 *
 * `--open-url` with a plain `http://` URL does nothing at all — verified on 2026-09-19 against a
 * request-logging server, zero hits. The URL service only routes `antigravity-ide://<publisher>.<ext>/…`
 * to an extension's `UriHandler`, so a twenty-line bridge extension does the routing:
 * `local.drive-preview`, which lives outside this repository at
 * `~/.antigravity-ide/extensions/local.drive-preview-0.0.1/` and calls `simpleBrowser.api.open`.
 * Check it with `"$IDE" --list-extensions | grep drive-preview`.
 *
 * Fire-and-forget on purpose. A machine without the IDE, or with the extension missing, gets one
 * line on stdout and a drive that completes normally.
 */
const IDE = "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide";
let paneWarned = false;
const pane = (url: string): void => {
  try {
    execFile(IDE, ["--open-url", `antigravity-ide://local.drive-preview/open?url=${encodeURIComponent(url)}`], (error) => {
      if (error && !paneWarned) {
        paneWarned = true;
        console.log(`preview pane unavailable (${error.message.split("\n")[0]}) — the drive carries on`);
      }
    });
  } catch (error) {
    if (!paneWarned) {
      paneWarned = true;
      console.log(`preview pane unavailable (${String(error)}) — the drive carries on`);
    }
  }
};

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

/**
 * The version actually installed for `apps/web`, read off disk.
 *
 * `apps/web/node_modules` and not the workspace root: pnpm hoists nothing by default, so a package
 * `apps/web` depends on is only under `apps/web`, and reading the root would find nothing — or,
 * worse, find some other workspace's copy at a different version and report it as the one that
 * built the app.
 */
const versionOf = (pkg: string): string =>
  (JSON.parse(readFileSync(join(ROOT, "apps", "web", "node_modules", pkg, "package.json"), "utf-8")) as { version: string })
    .version;

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  pane(`${BASE}/sign-in`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 15_000 });
  const token = await magicLinkTokenFor(EMAIL);
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=/app/projects`);
  await page.waitForURL(/\/app\/projects/, { timeout: 20_000 });
}

console.log(`cleaned up ${await deleteDriveUsers()} leftover drive account(s) before starting`);
pane(BASE);

const browser = await chromium.launch({
  headless: process.env.DRIVE_HEADLESS === "1",
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // ── 0. The server answering is the build just made, on the dependencies just installed ─────────
  //
  // `/healthz` reports `"commit":"unknown"` without `COMMIT_SHA`, so it cannot identify a local
  // build. `apps/web/.next/BUILD_ID` appears verbatim in the HTML and can (EPIC-052, lesson 17).
  // The three versions are recorded beside it because this epic's whole risk is which ones ran.

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const html = await page.content();
  const versions = `react ${versionOf("react")} · next ${versionOf("next")} · better-auth ${versionOf("better-auth")}`;
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && html.includes(buildId),
    `BUILD_ID ${buildId} ${html.includes(buildId) ? "is" : "is NOT"} in the HTML — ${versions}`,
  );
  // React and Next are the upgrades; better-auth is asserted at **exactly** 1.7.2 because holding
  // it there is this epic's finding, and a drive that let 1.7.5 pass would be silent about it.
  record(
    "the dependency set under test is the upgraded one, with better-auth held at 1.7.2",
    versionOf("react").startsWith("19.3.") &&
      versionOf("next") === "16.3.5" &&
      versionOf("better-auth") === "1.7.2",
    versions,
  );
  await page.screenshot({ path: join(SHOTS, "landing.png"), fullPage: false });

  // ── 1. Every public route serves, and its stylesheet is real CSS ───────────────────────────────

  for (const path of ROUTES) {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    pane(`${BASE}${path}`);
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

  // ── 3. Dark mode, because a token that resolves wrongly is invisible to every text assertion ───

  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const rgb = background.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  const isDark = (rgb[0] ?? 255) + (rgb[1] ?? 255) + (rgb[2] ?? 255) < 300;
  record("the landing page is dark in dark mode", isDark, `body background ${background}`);
  await page.screenshot({ path: join(SHOTS, "landing-dark.png"), fullPage: false });
  await page.emulateMedia({ colorScheme: "light" });

  // ── 4. The decompiler, because it is the one public page that runs `packages/core` ─────────────
  //
  // Every other public route is static copy. This one segments, classifies, clusters and detects,
  // which is where `contradiction.ts`, `similarity.ts`, `generate.ts` and `detect.ts` live — the
  // four core modules this epic edited. A finding appearing on screen is the end-to-end proof that
  // `detect()` still runs inside the built app, which is a different claim from a green unit test.

  await page.goto(`${BASE}/decompile`, { waitUntil: "networkidle" });
  pane(`${BASE}/decompile`);
  const prompt = [
    "You are a support agent for a payments company.",
    "Always escalate billing questions to a human.",
    "Do not escalate billing questions until you have checked the FAQ.",
    "Reply in JSON with the fields intent and confidence.",
    "Keep the answer under 80 words.",
  ].join("\n\n");
  // Selectors read off `apps/web/e2e/decompile.spec.ts` rather than invented: the first draft of
  // this drive guessed a `blok-card` test id that does not exist, and timed out on it.
  await page.getByLabel("Your prompt").fill(prompt);
  await page.getByRole("button", { name: "Decompile" }).click();
  await page.getByTestId("source-map").waitFor({ state: "visible", timeout: 30_000 });
  const blokCount = await page.locator(".blok-card").count();
  const findingCount = await page.locator(".finding").count();
  record(
    "the decompiler turns a pasted prompt into bloks in the built app",
    blokCount >= 3,
    `${blokCount} bloks`,
  );
  // `detect()` is the part that runs the 23 committed patterns this epic gave a test to, and the
  // prompt above contains a scoped-precondition pair on purpose — the case `contradiction.ts`'s
  // `SCOPED` guard exists for, in the file this epic edited.
  record("and runs the detectors over it", findingCount >= 1, `${findingCount} findings`);
  await page.screenshot({ path: join(SHOTS, "decompile.png"), fullPage: false });

  // ── 5. A fresh account signs in and creates a project through the UI ───────────────────────────
  //
  // Better Auth moved, so this is the assertion the upgrade is most likely to break.
  // `docs/AUTONOMOUS.md`: build the data through the product's own UI, never by seeding. Driving
  // the creation path is part of the test — it is how you find out that the path a real user takes
  // is broken.

  await signIn(page);
  pane(`${BASE}/app/projects`);
  record("a fresh account reaches the workbench", page.url().includes("/app/projects"), page.url());
  await page.screenshot({ path: join(SHOTS, "projects-empty.png"), fullPage: false });

  const name = `Sweep drive ${new Date().toISOString().slice(0, 10)}`;
  await page.getByLabel("New project").fill(name);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\//, { timeout: 20_000 });
  pane(page.url());
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
