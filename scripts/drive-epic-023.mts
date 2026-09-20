/**
 * EPIC-023's drive: the BUILT app on localhost, wearing the shell for the first time.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3120)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/023.env
 *   set -a && . /tmp/023.env && set +a
 *   pnpm --filter @41prompts/web start --port 3120 &
 *   npx tsx scripts/drive-epic-023.mts
 *
 * ## The claim, and how it is demonstrated
 *
 * The epic's Notes say to ask how the drive would demonstrate the feature **before** writing it
 * (HANDOVER lesson 36), and for this epic the answer wrote the whole script:
 *
 * > one browser session that reaches all nine destinations without typing a URL.
 *
 * So section 2 navigates by clicking, once, and never calls `page.goto` between the first landing
 * and the last destination. If it had to, the rail would not be done. `page.url()` after each click
 * is the evidence, and the transcript prints the trail.
 *
 * ## What the e2e suite already covers, and this does not repeat
 *
 * `apps/web/e2e/app-shell.spec.ts` asserts the group set, `aria-current`, the breadcrumb depth, the
 * keyboard disclosure and the 44px targets. Repeating them here would be a second copy of an
 * assertion, which is the thing this repository has refused six times. What a drive adds is the
 * part a spec cannot see: **that it looks right**, in both themes, at two widths, in a real
 * browser, with screenshots a person can disagree with.
 *
 * ## The query measurement
 *
 * `lib/app-shell/names.test.ts` proves the cache **key** and explicitly cannot prove the dedupe:
 * React's `cache()` is scoped to a Server Component render and is a passthrough outside one. So the
 * number in the report is measured here instead, by counting the statements Postgres logs while the
 * built app renders one page. `--count-queries` turns it on; it needs `log_statement=all` on the
 * container, which the report's command block sets.
 *
 * ## It is watched, not headless
 *
 * Soroush watches the drive happen, so it opens the built app in the IDE preview pane and drives it
 * in a visible browser. `DRIVE_HEADLESS=1` must keep working, because `gates.mjs ci` runs
 * unattended and must never wait on a window.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, and the account is cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3120";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-023");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-023-${Date.now()}@example.com`;
const COUNT_QUERIES = process.argv.includes("--count-queries");

const IDE = "/Applications/Antigravity IDE.app/Contents/Resources/app/bin/antigravity-ide";
let paneWarned = false;
const pane = (url: string): void => {
  try {
    execFile(
      IDE,
      ["--open-url", `antigravity-ide://local.drive-preview/open?url=${encodeURIComponent(url)}`],
      (error) => {
        if (error && !paneWarned) {
          paneWarned = true;
          console.log(`preview pane unavailable (${error.message.split("\n")[0]}) — the drive carries on`);
        }
      },
    );
  } catch (error) {
    if (!paneWarned) {
      paneWarned = true;
      console.log(`preview pane unavailable (${String(error)}) — the drive carries on`);
    }
  }
};

const results: { name: string; ok: boolean; detail: string }[] = [];
const transcript: string[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  const line = `${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`;
  transcript.push(line);
  console.log(line);
};

/**
 * Queries Postgres has logged, for the one measurement a unit test cannot make.
 *
 * **Both forms, and the first version counted only one of them.** `log_statement=all` writes
 * `LOG:  statement:` for a simple query and `LOG:  execute <name>:` for a prepared one — and the
 * driver prepares everything the application sends, so grepping `statement:` matched the
 * migrations and the drive's own cleanup and **nothing the page did**. It reported `0` for a page
 * render, which is the kind of number that should never be believed: a page that renders a
 * prompt's name made at least one.
 */
async function queryCount(): Promise<number> {
  if (!COUNT_QUERIES) return 0;
  const { spawnSync } = await import("node:child_process");
  const container = process.env.DRIVE_PG_CONTAINER ?? "41p-e2e-postgres";
  const result = spawnSync("docker", ["logs", container], { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 });
  // **Both streams, and the second version of this read only one.** Postgres writes its log to
  // **stderr**, `docker logs` keeps the two streams apart, and `execFileSync` returns stdout alone
  // — so the count was of the two lines Postgres happens to put on stdout and reported `0` for a
  // page render. Measured against the container: 636 query lines on stderr, 2 on stdout.
  const out = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return (out.match(/LOG: {2}(?:statement:|execute )/g) ?? []).length;
}

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
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 320,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

/** The rail's own column, so the disclosure's copy of it is never what gets clicked. */
const rail = (name: string) =>
  page.locator(".app-shell-rail .app-rail").getByRole("link", { name, exact: true });

try {
  // ── 1. A fresh account arrives, and the shell is there ─────────────────────────────────────────

  await signIn(page);
  pane(`${BASE}/app/projects`);
  record(
    "a fresh account reaches the workbench and the rail is on it",
    (await page.locator(".app-shell-rail .app-rail").count()) === 1,
    page.url(),
  );
  await page.screenshot({ path: join(SHOTS, "01-projects.png"), fullPage: false });

  // Build the data through the product's own UI, never by seeding (`docs/AUTONOMOUS.md`).
  await page.getByLabel("New project").fill(`Shell drive ${new Date().toISOString().slice(0, 10)}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\//, { timeout: 20_000 });
  await page.getByLabel("New prompt").fill("Refund classifier");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\//, { timeout: 20_000 });

  await page.getByRole("button", { name: "+ Add blok" }).click();
  await page.getByRole("menuitem", { name: "Add context" }).click();
  await page.locator(".canvas-list > li").first().getByLabel("Blok text")
    .fill("You are a support operations assistant. You classify inbound refund requests.");
  await page.locator(".canvas-list > li").first().locator(".blok-editor-state")
    .waitFor({ state: "attached" });
  await page.waitForTimeout(600);

  // ── 2. Nine destinations, by clicking, with no URL typed ───────────────────────────────────────
  //
  // This is the epic's claim and the only section that would fail it. `page.goto` is not called
  // once between here and the end of the walk.

  const trail: string[] = [];
  const step = async (name: string, expected: RegExp): Promise<boolean> => {
    await rail(name).click();
    await page.waitForURL(expected, { timeout: 15_000 }).catch(() => undefined);
    const ok = expected.test(page.url());
    trail.push(`${name}${ok ? "" : ` (FAILED → ${page.url()})`}`);
    pane(page.url());
    return ok;
  };

  const walk = [
    await step("Runs", /\/app\/pr\/pr_[0-9a-f]{8}\/runs$/),
    await step("Versions", /\/app\/pr\/pr_[0-9a-f]{8}\/versions$/),
    await step("Deploy", /\/app\/pr\/pr_[0-9a-f]{8}\/deploy$/),
    await step("Blok Editor", /\/app\/pr\/pr_[0-9a-f]{8}$/),
    // Connect flips the rail's context to the project — it is project-scoped — so `Prompts` is what
    // gets back. That link exists because the browser test found the walk stranded without it.
    await step("Connect", /\/app\/p\/proj_[0-9a-f]{4}\/connect$/),
    await step("Prompts", /\/app\/p\/proj_[0-9a-f]{4}$/),
    await step("Settings", /\/app\/settings\/providers$/),
    await step("Account", /\/app\/account$/),
    await step("Projects", /\/app\/projects$/),
  ];
  record(
    "nine destinations reached by clicking the rail, no URL typed",
    walk.every(Boolean),
    trail.join(" → "),
  );

  // ── 3. The chrome says the right things on a prompt's pages ────────────────────────────────────

  await page.getByRole("link", { name: "Shell drive", exact: false }).first().click();
  await page.waitForURL(/\/app\/p\//, { timeout: 15_000 });
  await page.getByRole("link", { name: "Refund classifier" }).click();
  await page.waitForURL(/\/app\/pr\//, { timeout: 15_000 });
  pane(page.url());

  const before = await queryCount();
  await rail("Runs").click();
  await page.waitForURL(/\/runs$/, { timeout: 15_000 });
  const after = await queryCount();

  const pill = (await page.locator(".app-topbar .pill").textContent()) ?? "";
  record(
    "the top bar carries Draft state on Runs, which never showed it before",
    /^Draft v\d+/.test(pill) && !/unsaved/i.test(pill),
    `pill ${JSON.stringify(pill)}`,
  );
  // Four headings — `Workspace`, the project, the prompt, `Account` — so the prompt's is the third.
  // The first version of this line read `nth(1)` and reported the project's name as a failure; the
  // browser spec had the same off-by-one, which is what a rail showing two records at once costs.
  const headings = await page.locator(".app-shell-rail .app-rail-groupname").allTextContents();
  record(
    "the rail shows the project and the prompt, outermost first",
    headings.length === 4 && headings[2] === "Refund classifier",
    headings.join(" · "),
  );
  if (COUNT_QUERIES) {
    record("queries Postgres logged for one page render", true, `${after - before} (measured, not asserted)`);
  }
  await page.screenshot({ path: join(SHOTS, "02-runs-with-shell.png"), fullPage: false });

  // ── 4. Dark, because a token that resolves wrongly is invisible to every text assertion ────────

  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload({ waitUntil: "networkidle" });
  const railBg = await page.evaluate(
    () => getComputedStyle(document.querySelector(".app-shell-rail .app-rail")!).backgroundColor,
  );
  const rgb = railBg.match(/\d+/g)?.map(Number) ?? [255, 255, 255];
  record(
    "the rail is dark in dark mode",
    (rgb[0] ?? 255) + (rgb[1] ?? 255) + (rgb[2] ?? 255) < 300,
    `rail background ${railBg}`,
  );
  await page.screenshot({ path: join(SHOTS, "03-dark.png"), fullPage: false });
  await page.emulateMedia({ colorScheme: "light" });

  // ── 5. A phone: the disclosure, and nothing past the edge ──────────────────────────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  record("nothing scrolls sideways at 390px", overflow <= 1, `overflow ${overflow}px`);
  record(
    "the desktop column is out of the document, so one rail is in the tree",
    !(await page.locator(".app-shell-rail").isVisible()),
    "app-shell-rail hidden",
  );
  await page.getByText("Menu", { exact: true }).click();
  await page.locator(".app-shell-menu-body .app-rail-link").first().waitFor({ state: "visible" });
  record("the menu opens and holds the same rail", true, `${await page.locator(".app-shell-menu-body .app-rail-link").count()} items`);
  await page.screenshot({ path: join(SHOTS, "04-phone-menu.png"), fullPage: false });

  // ── 6. Reduced motion shows end states rather than skipping them ───────────────────────────────

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "networkidle" });
  const currentVisible = await page.locator('.app-shell-rail [aria-current="page"]').isVisible();
  record("the current rail item is still marked under reduced motion", currentVisible, "aria-current visible");
  await page.screenshot({ path: join(SHOTS, "05-reduced-motion.png"), fullPage: false });
} finally {
  await browser.close();
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) on the way out`);
}

const passed = results.filter((r) => r.ok).length;
const summary = `${passed}/${results.length}`;
writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n\n${summary}\n`);
console.log(`\n${summary}`);
process.exit(passed === results.length ? 0 : 1);
