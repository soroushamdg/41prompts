/**
 * EPIC-032a's drive: inputs typed into the BUILT app, and the history they must not rewrite.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3120)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/032a.env
 *   set -a && . /tmp/032a.env && set +a
 *   FAKE_PROVIDER=1 pnpm --filter @41prompts/worker start &
 *   pnpm --filter @41prompts/web start --port 3120 &
 *   npx tsx scripts/drive-epic-032a.mts
 *
 * ## What this drive is for, narrowly
 *
 * The e2e suite already asserts all twelve criteria against a Playwright browser. What it cannot
 * assert is that the **built** application serves the grid — `next start` from a real `next build`,
 * not the dev server that generates every chunk on request and serves CSS from memory. A new
 * client component, a new stylesheet block and a new table are exactly the shape of thing that
 * passes 328 assertions and renders as unstyled text, which is the 2026-09-13 outage.
 *
 * So the claim is: **on the built app, a person can type two inputs, save them, run them, and find
 * that duplicating and editing the set did not change what the finished run ran against.**
 *
 * ## It is watched, not headless
 *
 * The app goes into the IDE preview pane and the drive runs in a visible browser. `pane()` is
 * fire-and-forget — a missing IDE or bridge extension logs one line and the drive carries on — and
 * `DRIVE_HEADLESS=1` keeps working, because `pnpm e2e` and `gates.mjs ci` must never wait on a
 * window. The pane does not follow Playwright's session, so it is re-fired at each step worth
 * seeing.
 *
 * ## What it does not cover
 *
 * The image build, the Coolify environment, Traefik, and migrations against the real database.
 * Nothing is pushed, so nothing deploys and no staging URL is evidence about any of this.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, cleaned up at both ends.
 */
import { chromium, type Page } from "@playwright/test";
import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3120";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-032a");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-032a-${Date.now()}@example.com`;

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
      }
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

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });
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
  slowMo: process.env.DRIVE_HEADLESS === "1" ? 0 : 350,
});
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
const page = await context.newPage();

try {
  // ── 1. the build under test ───────────────────────────────────────────────────────────────
  //
  // `/healthz` answers `"commit":"unknown"` for a locally built app, so the proof that this server
  // is the build just made is `apps/web/.next/BUILD_ID` appearing verbatim in the served HTML.
  const buildId = (await import("node:fs")).readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  await page.goto(BASE);
  const html = await page.content();
  record("the server is the build just made", html.includes(buildId), `BUILD_ID ${buildId} in the served HTML`);

  const css = await page.evaluate(() => {
    const link = document.querySelector('link[rel="stylesheet"]');
    return link?.getAttribute("href") ?? "";
  });
  const cssResponse = await page.request.get(`${BASE}${css}`);
  const cssBody = await cssResponse.text();
  record(
    "the stylesheet is real CSS, not an HTML error page",
    cssResponse.headers()["content-type"]?.includes("text/css") === true && cssBody.length > 1000,
    `${css} — ${cssBody.length} bytes, ${cssResponse.headers()["content-type"]}`
  );

  // ── 2. a prompt with one variable and one check, built by clicking ────────────────────────
  await signIn(page);
  pane(`${BASE}/app/projects`);
  record("a person who has never signed in can sign in", page.url().includes("/app/projects"), page.url());

  await page.getByLabel("New project").fill(`Scheduling ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/, { timeout: 20_000 });
  await page.getByLabel("New prompt").fill("Scheduler");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/, { timeout: 20_000 });
  const promptId = page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;
  record("a project and a prompt are created by clicking", promptId.startsWith("pr_"), promptId);

  async function addBlok(kind: string, text: string): Promise<void> {
    const before = await page.locator(".canvas-list > li").count();
    await page.getByRole("button", { name: `Add ${kind}` }).click();
    await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
    await page
      .locator(".canvas-list > li")
      .nth(before)
      .locator(".blok-editor-state")
      .waitFor({ state: "visible", timeout: 15_000 });
    await page.waitForFunction(
      (n) => document.querySelectorAll(".canvas-list > li")[n]?.querySelector(".blok-editor-state")?.getAttribute("data-state") === "saved",
      before,
      { timeout: 20_000 }
    );
  }

  await addBlok("context", "Answer the scheduling request.");
  await addBlok("expected", 'Never mention "sorry".');
  await addBlok("context", "{{request}}");
  await page.getByRole("tab", { name: "Variables" }).click();
  await page.getByRole("button", { name: "Declare request" }).click();
  await page
    .getByRole("region", { name: "Declared variables" })
    .getByText("request", { exact: true })
    .waitFor({ state: "visible", timeout: 15_000 });
  record("the variable is declared through the Variables tab", true, "request");

  // ── 3. the grid ───────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/app/pr/${promptId}/runs`);
  pane(`${BASE}/app/pr/${promptId}/runs`);

  const emptyText = (await page.getByRole("region", { name: "Inputs" }).locator(".app-empty").innerText()).trim();
  record(
    "the empty state names both ways in, not only the file",
    emptyText.includes("Upload a CSV") && emptyText.includes("by hand"),
    emptyText
  );
  await shot(page, "01-runs-empty-state");

  await page.getByRole("button", { name: "add inputs by hand" }).click();
  await page.getByTestId("by-hand").waitFor({ state: "visible", timeout: 15_000 });

  // `allInnerTexts` is the **rendered** text, which is the point: an accessible name is computed
  // from the DOM and CSS never reaches it, so a `getByRole` assertion cannot see a
  // `text-transform`. This check caught exactly that — the first styling rendered `REQUEST` for a
  // variable named `request`, and a variable name is case-sensitive.
  const headers = await page.locator(".runs-grid thead th").allInnerTexts();
  record(
    "the column is named for the variable, in the variable's own case",
    headers[0]?.trim() === "request" && headers.length === 2,
    `headers: ${JSON.stringify(headers)}`
  );

  // The visual check the whole drive exists for: a new component with new CSS, served by a build.
  const styled = await page.locator(".runs-byhand").evaluate((node) => {
    const style = getComputedStyle(node);
    return { border: style.borderTopWidth, padding: style.paddingTop, display: style.display };
  });
  record(
    "the grid is styled by the built stylesheet, not unstyled text",
    styled.border !== "0px" && styled.padding !== "0px",
    JSON.stringify(styled)
  );
  // Looking at the first drive's screenshot is what found this: "add them by hand" was still
  // sitting under the grid somebody was typing into.
  record(
    "the empty state steps aside once the grid is open",
    (await page.getByRole("region", { name: "Inputs" }).locator(".app-empty").count()) === 0,
    "no empty-state sentence under an open grid"
  );
  await shot(page, "02-grid-open");

  await page.getByTestId("cell-0-0").fill("Book a 30 minute standup for the backend team");
  await page.getByRole("button", { name: "Add row" }).click();
  await page.getByTestId("cell-1-0").fill("Move the retro to Thursday");
  await page.getByTestId("by-hand-name").fill("Typed by hand");
  await shot(page, "03-two-rows-typed");
  await page.getByTestId("by-hand-save").click();

  await page.locator(".runs-set-name", { hasText: "Typed by hand" }).waitFor({ state: "visible", timeout: 20_000 });
  const meta = await page.locator(".runs-set-meta").first().innerText();
  record("two typed rows save and list with their count", meta.includes("2 inputs") && meta.includes("request"), meta);
  await shot(page, "04-saved-set");

  record(
    "a set nothing has run offers Edit, not Duplicate",
    (await page.getByRole("button", { name: "Edit Typed by hand", exact: true }).count()) === 1 &&
      (await page.getByRole("button", { name: "Duplicate and edit Typed by hand" }).count()) === 0,
    "Edit present, Duplicate absent"
  );

  // ── 4. the run, and the binding ───────────────────────────────────────────────────────────
  await page.getByRole("button", { name: "Run Typed by hand" }).click();
  await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/, { timeout: 30_000 });
  const runUrl = page.url();
  pane(runUrl);
  await page.locator(".app-state").filter({ hasText: "Finished" }).waitFor({ state: "visible", timeout: 90_000 });
  record("the typed set runs to completion", true, runUrl);

  await page.getByRole("tab", { name: "By input" }).click();
  await page.locator(".heat-cell").first().click();
  const detail = await page.getByTestId("heat-detail").innerText();
  record(
    "the typed value is what the model was given",
    detail.includes("Book a 30 minute standup"),
    detail.replace(/\s+/g, " ").slice(0, 120)
  );
  await shot(page, "05-run-by-input");

  // ── 5. the finding: a finished run's inputs do not move ───────────────────────────────────
  await page.goto(`${BASE}/app/pr/${promptId}/runs`);
  pane(`${BASE}/app/pr/${promptId}/runs`);
  record(
    "once run, the set offers Duplicate and edit instead of Edit",
    (await page.getByRole("button", { name: "Duplicate and edit Typed by hand" }).count()) === 1 &&
      (await page.getByRole("button", { name: "Edit Typed by hand", exact: true }).count()) === 0,
    "Duplicate present, Edit absent"
  );
  await shot(page, "06-duplicate-and-edit");

  await page.getByRole("button", { name: "Duplicate and edit Typed by hand" }).click();
  await page.getByTestId("by-hand").waitFor({ state: "visible", timeout: 20_000 });
  await page.getByTestId("cell-0-0").fill("A REPLACEMENT the finished run never saw");
  await page.getByTestId("by-hand-save").click();
  await page
    .locator(".runs-set-name", { hasText: "Typed by hand (copy)" })
    .waitFor({ state: "visible", timeout: 20_000 });
  record("the copy is a separate set, named apart from the original", true, "Typed by hand (copy)");
  await shot(page, "07-copy-edited");

  await page.goto(runUrl);
  pane(runUrl);
  await page.getByRole("tab", { name: "By input" }).click();
  await page.locator(".heat-cell").first().click();
  const after = await page.getByTestId("heat-detail").innerText();
  record(
    "the finished run still shows the inputs it actually ran against",
    after.includes("Book a 30 minute standup") && !after.includes("A REPLACEMENT"),
    after.replace(/\s+/g, " ").slice(0, 120)
  );
  await shot(page, "08-history-unchanged");

  // ── 6. the refusal ────────────────────────────────────────────────────────────────────────
  await page.goto(`${BASE}/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "add inputs by hand" }).click();
  await page.getByTestId("by-hand").waitFor({ state: "visible", timeout: 15_000 });
  await page.getByTestId("by-hand-save").click();
  const refusal = await page.locator(".app-form-message").innerText();
  record(
    "an empty grid is refused, in words, without describing a file",
    refusal.includes("every row is empty") && !refusal.includes("file"),
    refusal
  );
  await shot(page, "09-empty-refusal");

  // ── 7. a phone ────────────────────────────────────────────────────────────────────────────
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/app/pr/${promptId}/runs`);
  await page.getByRole("button", { name: "add inputs by hand" }).click();
  await page.getByTestId("by-hand").waitFor({ state: "visible", timeout: 15_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  record("the grid does not make the page scroll sideways at 390px", overflow <= 0, `overflow ${overflow}px`);

  const removeBox = await page.getByRole("button", { name: "Remove row 1" }).boundingBox();
  record("the row control clears 44px on a phone", (removeBox?.height ?? 0) >= 44, `${removeBox?.height ?? 0}px tall`);
  await shot(page, "10-phone");
} finally {
  writeFileSync(join(SHOTS, "transcript.txt"), `${transcript.join("\n")}\n`, "utf-8");
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} checks passed`);
  console.log(`cleaned up ${await deleteDriveUsers()} drive account(s) afterwards`);
  await browser.close();
  if (passed !== results.length) process.exitCode = 1;
}
