// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * EPIC-031a: the first real Anthropic call this project has ever made, against deployed staging.
 *
 * ## What makes this different from the other drives
 *
 * `drive-epic-032/033/034.mjs` run against a local build with a fake provider. This runs against
 * **app.staging.41prompts.ai**, where the worker announced `provider: anthropic` at startup, so a
 * run here calls a real model and spends real money. Soroush funded it at $5 with a $5 cap and no
 * auto-recharge.
 *
 * ## The sign-in, and why it is the only sanctioned one
 *
 * `docs/PROCESS.md`, "Driving a deployed environment: the one supported mechanism": request a magic
 * link through the ordinary form, read the token back with **one read-only SELECT** on staging, and
 * open the verify URL. Standing permission, granted 2026-09-14, and narrow.
 *
 * **The token never reaches the transcript.** It is captured into a variable, used once, and never
 * logged — not on success, not in an error. It is a bearer credential for fifteen minutes.
 *
 * ## It cleans up after itself, at both ends
 *
 * `delete from users where email like 'claude-drive-%@example.com'` on staging, the second standing
 * permission. Run first as well as last, so a drive whose browser died does not leave a row for the
 * next person. `example.com` is reserved by RFC 2606, so the pattern cannot match a real account.
 *
 * ## What it drives
 *
 * EPIC-034's example, because it is the shortest honest path to a real call and because it is a
 * prompt that contradicts itself — one blok forbids "sorry", the last tells the model to say it. So
 * the first real call answers a question nothing has answered yet: **does a real model do what the
 * prompt actually says?** Then the blok is fixed and it runs again.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = process.env.STAGING_URL ?? "https://app.staging.41prompts.ai";
const OUT = "docs/epics/reports/screenshots/EPIC-031a";
mkdirSync(OUT, { recursive: true });

const email = `claude-drive-031a-${Date.now()}@example.com`;
let shot = 0;
const fail = [];

/** One command on the box. Output is returned, never echoed. */
function onBox(command) {
  return execFileSync("ssh", ["-o", "ConnectTimeout=20", "41p-box", command], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).trim();
}

/**
 * One SQL statement on staging, **piped over stdin rather than interpolated into a command**.
 *
 * The first version passed the statement through `psql -c` inside `docker exec … sh -c '…'` inside
 * `ssh '…'`, and the quotes did not survive three shells: `like 'claude-drive-%'` arrived as
 * `like claude-drive-%` and Postgres reported `column "claude" does not exist`. Over stdin the SQL
 * meets no shell at all, which is the shape `docs/PROCESS.md` documents for exactly this reason.
 */
function sqlOnStaging(container, sql) {
  return execFileSync(
    "ssh",
    [
      "-o",
      "ConnectTimeout=20",
      "41p-box",
      `docker exec -i ${container} sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA'`,
    ],
    { encoding: "utf8", input: sql, maxBuffer: 8 * 1024 * 1024 }
  ).trim();
}

function check(ok, title, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${title}${detail ? " — " + detail : ""}`);
  if (!ok) fail.push(title);
}
function note(title, value) {
  console.log(`  ....  ${title}: ${value}`);
}
async function shoot(page, tag) {
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}-${tag}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(`  shot  ${file}`);
}

// ── find staging's postgres, by deriving the app uuid rather than hardcoding it ────────────────
//
// `PROCESS.md`: "Look the container name up, never hardcode it." The random suffix changes on every
// redeploy — it changed underneath one drive between two commands. The stable part is the Coolify
// application uuid in the middle, and the honest way to get staging's is to read it off the worker
// we have already identified as staging by its DEPLOY_ENV, rather than pasting one in.
function deployEnvOf(container) {
  return onBox(
    `docker inspect ${container} --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^DEPLOY_ENV=' | head -1 | cut -d= -f2`
  );
}

const workers = onBox('docker ps --format "{{.Names}}" | grep -i worker').split("\n").filter(Boolean);
const stagingWorker = workers.find((name) => deployEnvOf(name) === "staging");
if (!stagingWorker) {
  console.error("No worker container reports DEPLOY_ENV=staging. Seen:", workers.join(", "));
  process.exit(2);
}
// worker-<appUuid>-<changing suffix>
const appUuid = stagingWorker.split("-")[1];

const pgNames = onBox('docker ps --format "{{.Names}}" | grep -i postgres').split("\n").filter(Boolean);
const PG = pgNames.find((name) => name.includes(appUuid));
if (!PG) {
  console.error(`No postgres container carries staging's app uuid. Seen: ${pgNames.join(", ")}`);
  process.exit(2);
}
console.log(`staging postgres: ${PG}\n`);

// ── cleanup first: a drive whose browser died must not leave a row ─────────────────────────────
sqlOnStaging(PG, "delete from users where email like 'claude-drive-%@example.com';");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
page.setDefaultTimeout(45_000);
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 160)));

process.on("unhandledRejection", async (error) => {
  console.log("\nDRIVE FAILED — " + String(error).split("\n")[0]);
  try {
    console.log("  url:", page.url());
    await page.screenshot({ path: `${OUT}/zz-failure.png`, fullPage: true });
  } catch {
    /* the page may already be closed */
  }
  sqlOnStaging(PG, "delete from users where email like 'claude-drive-%@example.com';");
  process.exit(1);
});

// ── sign in, by the one sanctioned mechanism ───────────────────────────────────────────────────
await page.goto("/sign-in?next=%2Fapp%2Fprojects");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send sign-in link" }).click();
await page.getByRole("status").waitFor();

// The token is read, used, and never printed. Not here, not in an error.
const token = sqlOnStaging(
  PG,
  `select identifier from verifications where value::jsonb ->> 'email' = '${email}' order by created_at desc limit 1;`
);
if (!token) {
  console.error("No verification row for the drive address — sign-in did not write one.");
  process.exit(2);
}
await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
await page.waitForURL(/\/app\/projects/);
check(true, "signed in on deployed staging");

const decline = page.getByRole("button", { name: "Decline" });
if (await decline.count()) {
  await decline.first().click();
  await decline.first().waitFor({ state: "hidden" }).catch(() => {});
}

// ── the example, then the first real call ──────────────────────────────────────────────────────
const offer = page.getByRole("region", { name: "Start from an example" });
check(await offer.isVisible(), "the example offer is on deployed staging");
await offer.getByRole("button", { name: "Start from an example" }).click();
await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}\/runs$/);
const promptId = page.url().split("/app/pr/")[1].split("/")[0];
await shoot(page, "the-example-on-staging");

console.log("\n  --- triggering the first real Anthropic call this project has made ---\n");
await page.getByRole("button", { name: /^Run / }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
const runUrl = page.url();
await page.locator(".app-state[data-state='done'], .app-state[data-state='refused']").waitFor({ timeout: 180_000 });

const state = await page.locator(".app-state").innerText();
check(!state.includes("Refused"), "the run was not refused", state);
await shoot(page, "the-first-real-run");

const kpis = await page.locator(".kpi-strip, [class*=kpi]").first().innerText().catch(() => "");
note("KPI strip", kpis.replace(/\n+/g, " | ").slice(0, 200));
const costSentence = await page.getByTestId("cost-sentence").innerText().catch(() => "(none)");
note("what it cost", costSentence);
const headline = await page.locator(".runs-headline").innerText().catch(() => "(none)");
note("the verdict", headline);

// What a real model actually replied — the thing no fake could tell us.
await page.getByRole("button", { name: "Show failure" }).click().catch(() => {});
const answer = await page.getByTestId("model-output").first().innerText().catch(() => "(no failure detail)");
note("the model's own words", answer.replace(/\n+/g, " ").slice(0, 200));
await shoot(page, "what-the-real-model-answered");

console.log(`\n  run: ${runUrl}\n`);
console.log(`${fail.length === 0 ? "DRIVE PASSED" : "DRIVE FAILED: " + fail.join("; ")}`);

// ── verify BEFORE cleaning up ──────────────────────────────────────────────────────────────────
//
// **The ordering is the lesson, and it was learned the expensive way.** The first version of this
// script deleted the drive user as its last act — and `runs.owner` references `users` with
// `onDelete: cascade`, so the cleanup destroyed the payload, the token counts, the latency and the
// `purge_after` stamp of the very call the epic exists to record. The screenshots survived; the
// evidence did not, and the call had to be paid for twice.
//
// So: read the row, then remove the user.
await browser.close();

if (process.argv.includes("--verify")) {
  console.log("\n  --- reading the run back out of staging's database ---\n");
  try {
    execFileSync("node", ["scripts/verify-first-call.mjs", "--staging", "--limit", "8"], { stdio: "inherit" });
  } catch {
    // A failing checklist is a result, not a crash. It is printed by the verifier itself, and the
    // cleanup below still has to happen.
    fail.push("the database checklist did not fully pass");
  }
}

// ── cleanup ────────────────────────────────────────────────────────────────────────────────────
sqlOnStaging(PG, "delete from users where email like 'claude-drive-%@example.com';");
console.log("drive data removed from staging.");
process.exit(fail.length === 0 ? 0 : 1);
