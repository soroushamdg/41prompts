/**
 * EPIC-034's browser drive, against the BUILT app on localhost.
 *
 * It walks the activation journey the way a new person does: sign up, take the example, run it, see
 * the failure, fix the blok that caused it, run again, pass. It times the journey and prints the
 * number against the roadmap's five-minute budget.
 *
 * **What it cannot show.** On deployed staging there is no provider key, so a real person cannot
 * reach a passing run at all. This drives the fake. The report says so rather than letting a
 * screenshot of a green run imply the product is measurably activating anybody.
 *
 * Run it with the built app serving on :3000 and a migrated database — the header of
 * scripts/drive-epic-032.mjs carries the five commands.
 */
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";

/** Every worker this drive started, so none outlives it. */
const workers = [];
import { mkdirSync } from "node:fs";

const OUT = "docs/epics/reports/screenshots/EPIC-034";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic034-${Date.now()}@example.com`;
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

console.log("--- a worker running the deterministic fake ---");
await startWorker({ FAKE_PROVIDER: "1" });

// The clock starts here: the first thing a signed-in person does, not the harness around it.
const startedAt = Date.now();

check("a new account sees the empty state", (await page.getByText("No projects yet.").count()) === 1);
const offer = page.getByRole("region", { name: "Start from an example" });
check("the example is offered beside it, not inside it", await offer.isVisible());
check("the offer says what it will create before creating it",
  (await offer.innerText()).includes("one rule about what it must"));
await shoot(page, "the-offer-beside-the-empty-state");

await offer.getByRole("button", { name: "Start from an example" }).click();
await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}\/runs$/);
const promptId = page.url().split("/app/pr/")[1].split("/")[0];
check("it lands on the runs page with the inputs already there",
  (await page.locator(".runs-set-name").count()) === 1);
const progress = page.getByRole("region", { name: "Getting started" });
check("the progress indicator starts at 1 of 4", (await progress.innerText()).includes("1 of 4"));
await shoot(page, "the-example-ready-to-run");

await page.getByRole("button", { name: /^Run / }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='done']").waitFor({ timeout: 120_000 });
const headline = await page.locator(".runs-headline").innerText();
check("the first run fails, as the example is built to", headline.includes("not verified"), headline);
await shoot(page, "the-first-run-fails");

await page.getByRole("button", { name: "Show failure" }).click();
const detail = page.getByTestId("failure-detail");
await detail.waitFor();
check("the failure names the rule it broke", (await detail.innerText()).includes('Never mention "sorry".'));
await shoot(page, "what-failed-and-why");

await page.goto(`/app/pr/${promptId}/runs`);
check("the progress follows the rows to 3 of 4", (await progress.innerText()).includes("3 of 4"));
await shoot(page, "progress-after-the-failure");

// The fix a person would actually make: the prompt tells the model to do the thing its own rule
// forbids. Resolved to an index before editing — a text filter stops matching its own filter.
await page.goto(`/app/pr/${promptId}`);
const rows = page.locator(".canvas-list > li");
check("the example arrived whole", (await rows.count()) === 4);
const fields = await rows.getByLabel("Blok text").all();
let apologyIndex = -1;
for (const [index, field] of fields.entries()) {
  if ((await field.inputValue()).includes("i'm sorry for the trouble")) apologyIndex = index;
}
check("the blok that contradicts the rule is on the canvas", apologyIndex >= 0);
await shoot(page, "the-contradiction-on-the-canvas");

await rows.nth(apologyIndex).getByLabel("Blok text").fill('Open every reply with "thanks for writing in".');
await page.waitForFunction(
  (i) => document.querySelectorAll(".canvas-list > li")[i]?.querySelector(".blok-editor-state")?.getAttribute("data-state") === "saved",
  apologyIndex
);

await page.goto(`/app/pr/${promptId}/runs`);
await page.getByRole("button", { name: /^Run / }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state[data-state='done']").waitFor({ timeout: 120_000 });
const passed = await page.locator(".runs-headline").innerText();
check("the second run passes", passed.includes("every one passed"), passed);
await shoot(page, "the-second-run-passes");

const seconds = (Date.now() - startedAt) / 1000;
check(`the journey fits the roadmap's five-minute budget`, seconds < 300, `${seconds.toFixed(1)}s of 300s`);

await page.goto(`/app/pr/${promptId}/runs`);
check("the progress reaches 4 of 4", (await progress.innerText()).includes("4 of 4"));
await shoot(page, "four-of-four");

await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await progress.waitFor();
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("no horizontal overflow at 390px", overflow <= 1, `overflow ${overflow}px`);
await shoot(page, "the-journey-at-390px");

stopWorkers();
psql("delete from users where email like 'claude-drive-%@example.com';");
console.log(`\n${fail.length === 0 ? "DRIVE PASSED" : "DRIVE FAILED: " + fail.join("; ")}`);
await browser.close();
process.exit(fail.length === 0 ? 0 : 1);
