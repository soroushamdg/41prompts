/**
 * EPIC-032's browser drive, against the BUILT app on localhost.
 *
 * Run it with the built app already serving on :3000 and a database it can read:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with the same DATABASE_URL
 *   node scripts/drive-epic-032.mjs
 *
 * **It is committed so the drive can be re-run rather than believed.** `CLAUDE.md`'s Definition of
 * Done asks for a page loaded in a browser and a screenshot in the report; a drive whose steps live
 * only in one session's scrollback is a claim about the past, and this one regenerates its own
 * evidence into `docs/epics/reports/screenshots/EPIC-032/`.
 *
 * Not the e2e suite: this loads the real pages a person loads, at both widths, and writes
 * screenshots a human reads. It also asserts the thing only a built app can fail — that the
 * stylesheet actually applied — because the 2026-09-13 outage was twenty epics of green tests over
 * a deployed page rendering as unstyled text.
 */
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";

/** Every worker this drive started, so none outlives it. */
const workers = [];
import { mkdirSync } from "node:fs";

const OUT = "docs/epics/reports/screenshots/EPIC-032";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic032-${Date.now()}@example.com`;
let shot = 0;
const fail = [];

function psql(sql) {
  return execFileSync("docker", ["exec", "-i", "41p-e2e-postgres", "psql", "-U", "41p", "-d", "41p", "-tA", "-c", sql], {
    encoding: "utf8",
  }).trim();
}
function check(name, ok, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
  if (!ok) fail.push(name);
}
async function shoot(page, label) {
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  shot  ${file}`);
}

process.on("unhandledRejection", async (error) => {
  console.log("\nDRIVE FAILED — " + String(error).split("\n")[0]);
  try {
    console.log("  url:", page.url());
    console.log("  message on screen:", JSON.stringify(await page.locator(".app-form-message").allTextContents()));
    console.log("  sets on screen:", JSON.stringify(await page.locator(".runs-set-name").allTextContents()));
    await page.screenshot({ path: `${OUT}/zz-drive-failure.png`, fullPage: true });
  } catch {
    // The page may already be closed; the first line is the part that matters.
  }
  process.exit(1);
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
// Raw Playwright has no default timeout, so a missing element waits for ever rather than failing.
// A drive that hangs tells you nothing; one that fails tells you which step and what was on screen.
page.setDefaultTimeout(30_000);
page.on("pageerror", (error) => console.log("  [pageerror]", String(error).slice(0, 200)));

// Sign in through the ordinary flow, reading the token back from the local database.
await page.goto("/sign-in?next=%2Fapp%2Fprojects");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send sign-in link" }).click();
await page.getByRole("status").waitFor();
const token = psql(`select identifier from verifications where value::jsonb ->> 'email' = '${email}' order by created_at desc limit 1;`);
await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
await page.waitForURL(/\/app\/projects/);

/**
 * Decline analytics before anything is screenshotted.
 *
 * The cookie choice is a fixed banner across the foot of every page (EPIC-017), so a full-page
 * screenshot taken with it open has a strip of the page hidden behind it — which is how the first
 * run of this drive produced a shot of a failure detail with the evidence line covered. Declining is
 * also the honest default for a throwaway drive account: it should not be sending events.
 */
const decline = page.getByRole("button", { name: "Decline" });
if (await decline.count()) {
  await decline.first().click();
  await decline.first().waitFor({ state: "hidden" }).catch(() => {});
}

// **The thing only a built app can fail.** Unstyled text is what shipped on 2026-09-13.
const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { font: body.fontFamily, bg: body.backgroundColor, sheets: document.styleSheets.length };
});
check("the built page is styled, not raw text", styled.sheets > 0 && !styled.font.startsWith("Times"), JSON.stringify(styled));

// Build a prompt through the product's own UI — no seeding.
await page.getByLabel("New project").fill(`Drive ${Date.now()}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/);
await page.getByLabel("New prompt").fill("Support reply");
await page.getByRole("button", { name: "Create prompt" }).click();
await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
const promptId = page.url().split("/app/pr/")[1].split(/[/?#]/)[0];

async function addBlok(kind, text) {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.locator(".canvas-list > li").nth(before).waitFor();
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await page.waitForFunction(
    (i) => document.querySelectorAll(".canvas-list > li")[i]?.querySelector(".blok-editor-state")?.getAttribute("data-state") === "saved",
    before
  );
}
await addBlok("context", "You are a support assistant.");
await addBlok("expected", 'Never mention "sorry".');
await addBlok("expected", "Reply in at most 30 words.");
await addBlok("expected", "Never mention refunds.");
await addBlok("context", "{{answer}}");
await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("button", { name: "Declare answer" }).click();
await page.getByRole("region", { name: "Declared variables" }).getByText("answer", { exact: true }).waitFor();

// The Run action in the page head reaches the runs page.
await page.goto(`/app/pr/${promptId}`);
await page.getByRole("link", { name: "Run" }).click();
await page.waitForURL(new RegExp(`/app/pr/${promptId}/runs$`));
check("the Run action in the page head reaches the runs page", true);
await shoot(page, "runs-empty-state");

// A column that binds nothing is refused at upload, and nothing is stored.
async function upload(name, body) {
  await page.goto(`/app/pr/${promptId}/runs`);
  await page.getByLabel("CSV file").setInputFiles({ name, mimeType: "text/csv", buffer: Buffer.from(body, "utf-8") });
  await page.getByRole("button", { name: "Upload" }).click();
  await page.locator(".runs-set-name, .app-form-message").first().waitFor();
  await page.waitForTimeout(400);
}
await upload("wrong.csv", "answer,urgency\nAll good.,high\n");
const refusal = (await page.locator(".app-form-message").allTextContents()).join(" ");
check("an unknown column is refused at upload, naming it", refusal.includes("urgency") && refusal.includes("Nothing was saved"), refusal);
check("nothing was stored", (await page.locator(".runs-set-name").count()) === 0);
await shoot(page, "upload-refused-names-the-column");

await upload("inputs.csv", 'answer\nAll good.\n"I am sorry, no."\n');
check("a CSV whose header names the variables uploads", (await page.locator(".runs-set-name").count()) === 1);
check("its rows are listed with their count", (await page.getByText("2 inputs · answer").count()) === 1);
await shoot(page, "input-set-uploaded");

/**
 * Start a worker, wait for its readiness line, and hand back a stop function.
 *
 * **The refusal needs a worker that is up and has no key**, which is the state staging is in while
 * EPIC-031a is deferred. With no worker at all the job simply stays `queued` and the page says
 * "Waiting to start" for ever — true, and not the thing being driven here.
 */
async function startWorker(extraEnv) {
  // `spawn`, detached, not `execFileSync` with a `&`: a synchronous exec waits for the stdout pipe
  // to close and a backgrounded child never closes it, so the drive hung for ten minutes twice
  // before this was measured rather than assumed. Detached also means the whole process group can
  // be killed — `pnpm` starts `node`, and killing pnpm leaves the node worker claiming jobs, which
  // is the same defect this epic fixed in `apps/web/e2e/worker-process.ts`.
  const child = spawn("pnpm", ["--filter", "@41prompts/worker", "start"], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: "test", ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  workers.push(child);
  let log = "";
  child.stdout?.on("data", (c) => (log += c.toString()));
  child.stderr?.on("data", (c) => (log += c.toString()));
  for (let i = 0; i < 160; i += 1) {
    if (log.includes("worker queues ready")) {
      console.log(`  worker ready (${Object.keys(extraEnv).join(",") || "no provider"})`);
      return { child, get log() { return log; } };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("worker never reported ready:\n" + log);
}

function stopWorkers() {
  for (const child of workers) {
    if (child.pid !== undefined) {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // Already gone, which is the outcome we wanted.
      }
    }
  }
  workers.length = 0;
}

// --- A worker that is up with no provider: the run is refused in words, not a spinner. ---
const noProvider = await startWorker({});
check("a worker with no provider says so at startup", noProvider.log.includes("no provider configured"));
await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='refused']").waitFor({ timeout: 120_000 });
const refusedText = await page.locator(".app-state").innerText();
check("a run with no provider is refused, in words", /no model provider is configured/.test(refusedText), refusedText);
await shoot(page, "run-refused-no-provider");
await page.goto(`/app/pr/${promptId}/runs`);
check("a refused run is legible as refused in the history", (await page.getByText("Refused", { exact: false }).count()) > 0);
await shoot(page, "history-shows-the-refusal");

console.log("--- swapping the worker for one running the deterministic fake ---");
stopWorkers();
const fakeWorker = await startWorker({ FAKE_PROVIDER: "1" });
check("a worker running the fake announces it rather than being quiet", fakeWorker.log.includes("deterministic fake"));

await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='done']").waitFor({ timeout: 120_000 });
const results = page.getByRole("region", { name: "Results by check" });
check("results are listed by check", await results.isVisible());
check("a failing check carries an icon beside the colour, not colour alone",
  (await results.locator("li[data-status='fail'] .status-icon").innerText()) === "✕");
check("a check nothing could grade is neither pass nor fail",
  (await results.locator("li[data-status='not-checked']").count()) === 1);
await shoot(page, "results-by-check");

await page.getByRole("button", { name: "Show failure" }).click();
const detail = page.getByTestId("failure-detail");
await detail.waitFor();
check("the model output is the bound value, so the row really reached the model",
  (await detail.getByTestId("model-output").innerText()).includes("I am sorry, no."));
check("the failing region is marked", (await detail.getByTestId("failing-region").innerText()) === "sorry");
check("the failure names exactly one blok", (await detail.locator(".blok-card").count()) === 1);
await shoot(page, "failure-detail-and-attribution");

await page.getByRole("button", { name: "Create constraint from this failure" }).click();
const preview = page.getByTestId("constraint-preview");
await preview.waitFor();
check("the preview shows the text before anything is added",
  (await preview.getByLabel("Constraint text").inputValue()) === 'Never mention "sorry".');
await shoot(page, "constraint-preview-before-adding");
await preview.getByRole("button", { name: "Add constraint blok" }).click();
await page.waitForFunction(() => document.querySelector("[data-testid='constraint-preview']") === null);
await page.goto(`/app/pr/${promptId}`);
const last = await page.locator(".canvas-list > li").last().getByLabel("Blok text").inputValue();
check("confirming adds the constraint blok to the canvas", last === 'Never mention "sorry".');
await shoot(page, "constraint-on-the-canvas");

// The sentences, and the phone.
await page.goto(`/app/pr/${promptId}/runs`);
await page.locator(".runs-history a").first().click();
await page.getByRole("region", { name: "Results by check" }).waitFor();
const cost = await page.getByTestId("cost-sentence").innerText();
check("the cost sentence says what it counts", /this run/i.test(cost), cost);
await shoot(page, "the-two-sentences");

await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.getByRole("region", { name: "Results by check" }).waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 390px", overflow <= 1, `overflow ${overflow}px`);
await shoot(page, "results-at-390px");
await page.goto(`/app/pr/${promptId}/runs`);
await shoot(page, "runs-page-at-390px");

stopWorkers();
psql("delete from users where email like 'claude-drive-%@example.com';");
console.log(`\n${fail.length === 0 ? "DRIVE PASSED" : "DRIVE FAILED: " + fail.join("; ")}`);
await browser.close();
process.exit(fail.length === 0 ? 0 : 1);
