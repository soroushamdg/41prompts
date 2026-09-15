/**
 * EPIC-033's browser drive, against the BUILT app on localhost.
 *
 * It drives the one thing this epic added that a person can see: a `refuses_to_answer` check, which
 * before this epic read `Not checked` for every input for ever, now carrying a verdict, a rationale
 * attributed to the pinned judge, and a judge cost said apart from the run's.
 *
 * The judge is faked (`FAKE_JUDGE=1`), so what this drives is the pipeline and the page — not a
 * model being good at recognising refusals. The report says so rather than letting a screenshot
 * imply it.
 *
 * Run it with the built app already serving on :3000 and a database it can read:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with the same DATABASE_URL
 *   node scripts/drive-epic-033.mjs
 *
 * **It is committed so the drive can be re-run rather than believed.** `CLAUDE.md`'s Definition of
 * Done asks for a page loaded in a browser and a screenshot in the report; a drive whose steps live
 * only in one session's scrollback is a claim about the past, and this one regenerates its own
 * evidence into `docs/epics/reports/screenshots/EPIC-033/`.
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

const OUT = "docs/epics/reports/screenshots/EPIC-033";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic033-${Date.now()}@example.com`;
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

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
page.setDefaultTimeout(30_000);
page.on("pageerror", (error) => console.log("  [pageerror]", String(error).slice(0, 200)));

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

const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { font: body.fontFamily, bg: body.backgroundColor, sheets: document.styleSheets.length };
});
check("the built page is styled, not raw text", styled.sheets > 0 && !styled.font.startsWith("Times"), JSON.stringify(styled));

const marker = `drive ${Date.now()}`;
await page.getByLabel("New project").fill(`Judge ${Date.now()}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/);
await page.getByLabel("New prompt").fill("Support");
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
await addBlok("context", `You are a support assistant. ${marker}`);
// The rule that had no reachable kind until this epic, and therefore no check at all.
await addBlok("expected", "Refuse to answer questions about pricing.");
await addBlok("context", "{{answer}}");
await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("button", { name: "Declare answer" }).click();
await page.getByRole("region", { name: "Declared variables" }).getByText("answer", { exact: true }).waitFor();
await shoot(page, "the-refusal-rule-on-the-canvas");

await page.goto(`/app/pr/${promptId}/runs`);
const csv = `answer\n<<refuses>> I can't help with pricing. ${marker}\nPricing starts at $10 a seat. ${marker}\n`;
await page.getByLabel("CSV file").setInputFiles({ name: "inputs.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf-8") });
await page.getByRole("button", { name: "Upload" }).click();
await page.locator(".runs-set-name, .app-form-message").first().waitFor();
check("the input set uploaded", (await page.locator(".runs-set-name").count()) === 1,
  (await page.locator(".app-form-message").allTextContents()).join(" "));

console.log("--- a worker with the model fake and the judge fake ---");
const worker = await startWorker({ FAKE_PROVIDER: "1", FAKE_JUDGE: "1" });
check("the worker announces that it is running a fake judge", worker.log.includes("fake judge"));

await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='done']").waitFor({ timeout: 120_000 });

const results = page.getByRole("region", { name: "Results by check" });
const row = results.locator("li").filter({ hasText: "Refuse to answer questions about pricing." });
const rowText = await row.innerText();
check("the refusal check is graded rather than 'Not checked'", !rowText.includes("Not checked"), rowText.split("\n")[0]);
check("one input refused and one answered", rowText.includes("1 of 2 passed"));
check("the check carries a pass/fail icon, not colour alone", (await row.locator(".status-icon").innerText()) === "\u2715");
await shoot(page, "refusal-check-graded-by-the-judge");

await page.getByRole("button", { name: "Show failure" }).click();
const detail = page.getByTestId("failure-detail");
await detail.waitFor();
const evidence = detail.getByTestId("evidence");
const said = await evidence.innerText();
check("the rationale is attributed to the pinned judge", said.includes("Judged by") && said.includes("claude-haiku-4-5-20251001"), said);
check("judged evidence is marked as testimony, not as a measurement",
  (await evidence.getAttribute("data-judged")) === "true");
check("the failure still names exactly one blok", (await detail.locator(".blok-card").count()) === 1);
await shoot(page, "the-judges-rationale-beside-the-blok");

const judgeCost = await page.getByTestId("judge-cost-sentence").innerText();
const runCost = await page.getByTestId("cost-sentence").innerText();
check("judging cost is said apart from the run's cost", judgeCost.includes("apart from the run"), judgeCost);
check("the run's own cost sentence says nothing about judging", !runCost.includes("Judging"), runCost);
await shoot(page, "judge-cost-said-separately");

// A second identical run: the judge is answered by the cache and calls nobody.
await page.goto(`/app/pr/${promptId}/runs`);
await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='done']").waitFor({ timeout: 120_000 });
const cached = await page.getByTestId("judge-cost-sentence").innerText();
check("a repeated judgement is answered by the cache at no cost", cached.includes("nothing") && cached.includes("cache"), cached);
await shoot(page, "a-repeated-judgement-costs-nothing");

await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.getByRole("region", { name: "Results by check" }).waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 390px", overflow <= 1, `overflow ${overflow}px`);
await shoot(page, "judged-results-at-390px");

stopWorkers();
psql("delete from users where email like 'claude-drive-%@example.com';");
console.log(`\n${fail.length === 0 ? "DRIVE PASSED" : "DRIVE FAILED: " + fail.join("; ")}`);
await browser.close();
process.exit(fail.length === 0 ? 0 : 1);
