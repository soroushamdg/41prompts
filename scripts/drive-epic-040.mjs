/**
 * EPIC-040's browser drive, against the BUILT app on localhost.
 *
 * Run it with the built app already serving on :3000 and a database it can read:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with the same DATABASE_URL
 *   node scripts/drive-epic-040.mjs
 *
 * ## What this drive is for, given that EPIC-040 renders nothing
 *
 * There is no Versions page — that is EPIC-041. So this is **not** a drive of a new screen, and the
 * report says so plainly rather than implying otherwise.
 *
 * What it *is* for is the thing this epic genuinely risks: it added a write to **all eight**
 * mutating canvas actions and to the run trigger. Those are the paths a person uses constantly. A
 * regression there would not look like a missing feature, it would look like editing being broken —
 * and that is exactly the class of failure the built app can have and the dev server cannot, which
 * is the whole reason this rule exists (`PROCESS.md`, 2026-09-13).
 *
 * So: edit a prompt by hand, in a real browser, against a real build, and then read the versions
 * out of the database — because whether a save minted, rewrote or skipped a row is a database fact
 * and asserting it through a screen that does not show it would be asserting something else.
 *
 * Cleanup runs first and last. **Last is after the verification, never as an unconditional final
 * act** — EPIC-031a's drive deleted its own user as its last step and cascaded away the evidence
 * the epic existed to collect. Read the rows, then tidy.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = "docs/epics/reports/screenshots/EPIC-040";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic040-${Date.now()}@example.com`;
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

/** The standing cleanup, scoped by identity. `example.com` is RFC 2606 reserved; the prefix is ours. */
function cleanup() {
  psql("delete from users where email like 'claude-drive-%@example.com';");
}

cleanup();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, baseURL: BASE });
page.setDefaultTimeout(30_000);
page.on("pageerror", (error) => console.log("  [pageerror]", String(error).slice(0, 200)));

process.on("unhandledRejection", async (error) => {
  console.log("\nDRIVE FAILED — " + String(error).split("\n")[0]);
  try {
    console.log("  url:", page.url());
    await page.screenshot({ path: `${OUT}/zz-drive-failure.png`, fullPage: true });
  } catch {
    // The page may already be closed; the first line is the part that matters.
  }
  process.exit(1);
});

console.log("\nEPIC-040 — versions, driven against the built app\n");

// ── Sign in as a fresh person, so the first-run path is the one being driven ────────────────────
await page.goto("/sign-in?next=%2Fapp%2Fprojects");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send sign-in link" }).click();
await page.getByRole("status").waitFor();
const token = psql(
  `select identifier from verifications where value::jsonb ->> 'email' = '${email}' order by created_at desc limit 1;`,
);
await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
await page.waitForURL(/\/app\/projects/);

const decline = page.getByRole("button", { name: "Decline" });
if (await decline.isVisible().catch(() => false)) await decline.click();

// The assertion only a built app can fail: the stylesheet actually applied. Twenty epics of green
// tests sat on top of a deployed page rendering as unstyled text.
const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { background: body.backgroundColor, family: body.fontFamily };
});
check("the built app is styled", styled.background !== "rgba(0, 0, 0, 0)" && styled.family.length > 0, JSON.stringify(styled));

// ── Build a prompt by hand, through the product's own creation path ─────────────────────────────
await page.getByLabel("New project").fill(`Versions drive ${Date.now()}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/);
await page.getByLabel("New prompt").fill("Support router");
await page.getByRole("button", { name: "Create prompt" }).click();
await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
const promptId = page.url().split("/app/pr/")[1].split(/[/?#]/)[0];
console.log(`  prompt ${promptId}`);

async function addBlok(kind, text) {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await page
    .locator(".canvas-list > li")
    .nth(before)
    .locator(".blok-editor-state[data-state='saved']")
    .waitFor();
}

await addBlok("context", "You route inbound support email for a payments company.");
await addBlok("constraint", "Reply in at most 80 words.");
await addBlok("expected", "Respond with valid JSON containing category and needs_human.");
await shoot(page, "the-canvas-after-three-bloks");

const versions = () =>
  psql(
    `select n || '|' || coalesce(pinned_at::text,'-') from prompt_versions where prompt = '${promptId}' order by n desc;`,
  )
    .split("\n")
    .filter(Boolean);

// ── Rule 1 and 2: many saves, one open draft ────────────────────────────────────────────────────
let rows = versions();
check("three bloks and six-plus saves produced one version", rows.length === 1, rows.join(" "));
check("it is Draft v1 and it is not pinned", rows[0] === "1|-", rows[0]);

// Editing again must still not mint a second one.
await page.locator(".canvas-list > li").nth(1).getByLabel("Blok text").fill("Reply in at most 40 words.");
await page.locator(".canvas-list > li").nth(1).locator(".blok-editor-state[data-state='saved']").waitFor();
rows = versions();
check("editing a blok rewrites the open draft rather than minting", rows.length === 1 && rows[0] === "1|-", rows.join(" "));
const draftText = psql(
  `select compiled_text from prompt_versions where prompt = '${promptId}' and n = 1;`,
);
check("the open draft carries the edit", draftText.includes("40 words"), draftText.slice(0, 60));

// ── Rule 3: a run pins it, and the next edit opens the next ─────────────────────────────────────
await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("tabpanel", { name: "Variables" }).waitFor();
await page.goto(`/app/pr/${promptId}`);
await addBlok("context", "{{message}}");
await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("button", { name: "Declare message" }).click();
await page
  .getByRole("region", { name: "Declared variables" })
  .getByText("message", { exact: true })
  .waitFor();

await page.goto(`/app/pr/${promptId}/runs`);
await page.getByLabel("CSV file").setInputFiles({
  name: "inputs.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("message\nmy card was charged twice\n", "utf-8"),
});
await page.getByRole("button", { name: "Upload" }).click();
await page.locator(".runs-set-name").filter({ hasText: /^inputs\.csv$/ }).waitFor();
await shoot(page, "the-runs-page-with-an-input-set");

await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
const runId = page.url().split("/runs/")[1];
await shoot(page, "the-run-that-pinned-a-version");

rows = versions();
check("triggering a run pinned Draft v1", rows.length === 1 && rows[0].startsWith("1|") && !rows[0].endsWith("|-"), rows.join(" "));

const pinnedId = psql(`select id from prompt_versions where prompt = '${promptId}' and n = 1;`);
const runVersion = psql(`select coalesce(version,'-') from suite_runs where id = '${runId}';`);
check("the run points at the version it ran", runVersion === pinnedId, `${runVersion} vs ${pinnedId}`);

await page.goto(`/app/pr/${promptId}`);
await addBlok("constraint", "Never promise a refund.");
rows = versions();
check("the edit after the run opened Draft v2", rows.length === 2 && rows[0].startsWith("2|"), rows.join(" "));

const frozen = psql(`select compiled_text from prompt_versions where prompt = '${promptId}' and n = 1;`);
check("v1 is frozen — it does not contain the later edit", !frozen.includes("Never promise a refund."), frozen.slice(-60));
const open = psql(`select compiled_text from prompt_versions where prompt = '${promptId}' and n = 2;`);
check("v2 does contain it", open.includes("Never promise a refund."), open.slice(-60));
await shoot(page, "the-canvas-after-the-second-version");

// ── The hand edit compiles through ──────────────────────────────────────────────────────────────
await page.locator(".compiled-notes > div").nth(0).getByRole("button", { name: "Edit by hand" }).click();
await page.getByLabel("Edit this span by hand").fill("You route payments support email, briefly.");
await page.getByRole("button", { name: "Save this span" }).click();
await page.locator(".compiled-span").nth(0).waitFor();
await page.locator(".compiled-span[data-presentation='edited']").first().waitFor();
await shoot(page, "a-span-edited-by-hand");

const edited = psql(
  `select compiled_text from prompt_versions where prompt = '${promptId}' order by n desc limit 1;`,
);
check(
  "the newest version's compiled text is what a run would send, hand edit included",
  edited.includes("You route payments support email, briefly."),
  edited.slice(0, 70),
);

// ── The canvas still works, which is the regression this drive is really for ────────────────────
const blokCount = await page.locator(".canvas-list > li").count();
check("every blok is still on the canvas after all of that", blokCount === 5, `${blokCount} bloks`);
const errorsOnScreen = await page.locator(".app-form-message").allTextContents();
check("nothing on screen reports a failure", errorsOnScreen.length === 0, JSON.stringify(errorsOnScreen));

// ── Narrow, because the app chrome has wrapped below 414px before (BUG-069) ─────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`/app/pr/${promptId}`);
await page.locator(".canvas-list > li").first().waitFor();
const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("no horizontal overflow at 390px", !overflows);
await shoot(page, "the-canvas-at-390px");

console.log("\n" + (fail.length === 0 ? "DRIVE PASSED — every check" : `DRIVE FAILED — ${fail.join(", ")}`));

// Cleanup runs *after* the verification, never as an unconditional last act (EPIC-031a's lesson:
// `users` cascades into everything, and a tidy-up that always runs last will eventually delete the
// evidence the drive existed to produce).
await browser.close();
cleanup();
process.exit(fail.length === 0 ? 0 : 1);
