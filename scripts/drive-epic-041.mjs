/**
 * EPIC-041's browser drive, against the BUILT app on localhost.
 *
 * Run it with the built app already serving on :3000 and a database it can read:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   pnpm --filter @41prompts/web start --port 3000     # with the same DATABASE_URL
 *   node scripts/drive-epic-041.mjs
 *
 * `next start` needs the placeholders in `apps/web/e2e/env.mjs` and not invented ones — hand-made
 * values give *"Something went wrong."* on sign-in, which is Better Auth failing to construct.
 *
 * ## What this drive is for
 *
 * Unlike EPIC-040's, this epic renders a whole page, so this **is** a drive of a new screen: the
 * history, the diff, restore, the note, and A/B, each pressed by hand at 1440px and then at 390px.
 *
 * The three things only a built app can answer are the reason it exists rather than the e2e suite
 * being enough: whether the new stylesheet actually built and applied, whether the two-column grid
 * holds on a phone, and whether the page renders at all in a production bundle.
 *
 * Every state the page has is visited on purpose, including the ones that are easy to skip — one
 * version and therefore no diff, a version nothing has run — because a first-run state that throws
 * is a defect nobody sees until the day somebody signs up.
 *
 * Cleanup runs first and last. **Last is after the verification, never as an unconditional final
 * act** — EPIC-031a's drive deleted its own user as its last step and cascaded away the evidence
 * the epic existed to collect.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = "docs/epics/reports/screenshots/EPIC-041";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic041-${Date.now()}@example.com`;
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

console.log("\nEPIC-041 — the Versions page, driven against the built app\n");

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

// The assertion only a built app can fail: the stylesheet actually applied.
const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { background: body.backgroundColor, family: body.fontFamily };
});
check("the built app is styled", styled.background !== "rgba(0, 0, 0, 0)" && styled.family.length > 0, JSON.stringify(styled));

// ── Build a prompt by hand, through the product's own creation path ─────────────────────────────
await page.getByLabel("New project").fill(`Versions page drive ${Date.now()}`);
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

const versions = () =>
  psql(
    `select n || '|' || coalesce(pinned_at::text,'-') from prompt_versions where prompt = '${promptId}' order by n desc;`,
  )
    .split("\n")
    .filter(Boolean);

await addBlok("context", "You route inbound support email for a payments company about {{message}}.");
await addBlok("constraint", "Reply in at most 80 words.");

// ── The first state, and the one easiest to forget: one version, so no diff ─────────────────────
await page.getByRole("link", { name: "Versions" }).click();
await page.waitForURL(new RegExp(`/app/pr/${promptId}/versions$`));
await page.locator(".versions-list > li").first().waitFor();
await shoot(page, "one-version-no-diff");

const firstCount = await page.locator(".versions-list > li").count();
check("a brand-new prompt has exactly one version, listed", firstCount === 1, `${firstCount} rows`);
const firstName = await page.locator(".versions-item-name").first().textContent();
check("it is named Draft v1, per ADR-003", firstName?.trim() === "Draft v1", String(firstName));
const firstRate = await page.locator(".versions-item-rate").first().textContent();
check("a version nothing has run says so rather than showing 0%", firstRate?.trim() === "No run yet.", String(firstRate));
const noDiff = await page.getByTestId("no-diff").textContent();
check("one version renders a sentence rather than an empty or broken diff", (noDiff ?? "").includes("only one version"), (noDiff ?? "").slice(0, 60));

// ── Declare the variable, upload inputs, run — which pins Draft v1 ──────────────────────────────
await page.goto(`/app/pr/${promptId}`);
await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("button", { name: "Declare message" }).click();
await page.getByRole("region", { name: "Declared variables" }).getByText("message", { exact: true }).waitFor();

await page.goto(`/app/pr/${promptId}/runs`);
await page.getByLabel("CSV file").setInputFiles({
  name: "inputs.csv",
  mimeType: "text/csv",
  buffer: Buffer.from("message\nmy card was charged twice\n", "utf-8"),
});
await page.getByRole("button", { name: "Upload" }).click();
await page.locator(".runs-set-name").filter({ hasText: /^inputs\.csv$/ }).waitFor();
await page.getByRole("button", { name: "Run inputs.csv" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);

const ranVersion = await page.getByTestId("run-version").textContent();
check("the run detail says which version it ran", (ranVersion ?? "").includes("Ran Draft v1"), String(ranVersion).trim());

// ── Edit, and move, so the diff has something of each kind to say ───────────────────────────────
await page.goto(`/app/pr/${promptId}`);
await addBlok("expected", "Respond with valid JSON containing category and needs_human.");
await page.locator(".canvas-list > li").nth(1).getByRole("button", { name: "Move up" }).click();
// The card reorders optimistically; the version is the condition that says the move was *saved*.
for (let attempt = 0; attempt < 60 && versions().length < 2; attempt++) {
  await page.waitForTimeout(250);
}
const afterEdit = versions();
check("editing after a run opened Draft v2", afterEdit.length === 2 && afterEdit[0].startsWith("2|"), afterEdit.join(" "));
await shoot(page, "the-canvas-after-the-edit-and-the-move");

// **A thing worth looking at rather than assuming**: does the compiled pane follow a move without a
// navigation? Reported either way; it is EPIC-021b's surface, not this epic's, and this drive is the
// first place a person has looked.
const paneOrder = await page.locator(".compiled-span").allTextContents();
const canvasOrder = await page.locator(".canvas-list > li .blok-editor-text, .canvas-list > li textarea").allTextContents();
console.log(`  note  compiled pane first span: ${JSON.stringify((paneOrder[0] ?? "").slice(0, 40))}`);
console.log(`  note  canvas first card:        ${JSON.stringify((canvasOrder[0] ?? "").slice(0, 40))}`);

// ── The page proper ─────────────────────────────────────────────────────────────────────────────
await page.goto(`/app/pr/${promptId}/versions`);
await page.locator(".versions-list > li").first().waitFor();
await shoot(page, "the-versions-page-with-a-diff");

const names = await page.locator(".versions-item-name").allTextContents();
check("the history lists both, newest first", names.join(",") === "Draft v2,Draft v1", names.join(","));

const heading = await page.locator(".versions-diff-panel h2").textContent();
check("the diff panel names the pair it is showing", heading?.trim() === "Draft v1 → Draft v2", String(heading));

const verbs = await page.locator(".versions-diff > li").evaluateAll((nodes) => nodes.map((n) => n.getAttribute("data-verb")));
check("the diff reports the added blok", verbs.includes("added"), verbs.join(","));
check("the moved blok reads as moved", verbs.includes("moved"), verbs.join(","));
check("and never as removed plus added — the roadmap's named test", !verbs.includes("removed"), verbs.join(","));

const bytes = await page.locator(".versions-bytes").textContent();
check("the compiled byte delta is shown", /\d+ → \d+ bytes/.test(bytes ?? ""), (bytes ?? "").trim());

// **Rule 10.** Green, red and amber mean pass, fail and drift. A pass rate is a measurement, so
// nothing on this page may be painted in any of the three.
const colours = await page.evaluate(() => {
  const forbidden = ["--color-pass", "--color-fail", "--color-warn"].map((name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim().toLowerCase(),
  );
  const used = new Set();
  for (const node of document.querySelectorAll(".versions-row *, .versions-actions *")) {
    const style = getComputedStyle(node);
    used.add(style.color.toLowerCase());
    used.add(style.backgroundColor.toLowerCase());
    used.add(style.borderTopColor.toLowerCase());
  }
  // Compare as rendered rgb() rather than as the token's own hex.
  const asRgb = (hex) => {
    const probe = document.createElement("span");
    probe.style.color = hex;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color.toLowerCase();
    probe.remove();
    return value;
  };
  return { forbidden: forbidden.map(asRgb), used: [...used] };
});
const painted = colours.forbidden.filter((colour) => colours.used.includes(colour));
check("no pass, fail or drift colour appears on the page (rule 10)", painted.length === 0, painted.join(",") || "none");

// ── A note, written by hand ─────────────────────────────────────────────────────────────────────
await page.getByLabel("Note on Draft v2").fill("added the JSON check and moved the constraint up");
await page.getByRole("button", { name: "Save note" }).click();
await page.locator(".versions-item-note").first().waitFor();
const note = await page.locator(".versions-item-note").first().textContent();
check("a note written here appears in the history", (note ?? "").includes("added the JSON check"), String(note).trim());
await shoot(page, "a-note-on-a-version");

// ── A/B ─────────────────────────────────────────────────────────────────────────────────────────
await page.getByRole("button", { name: /^A\/B Draft v1 vs Draft v2$/ }).click();
await page.waitForURL(new RegExp(`/app/pr/${promptId}/runs$`));
await page.locator(".runs-history-version").first().waitFor();
await shoot(page, "the-runs-page-after-an-ab");

const pairs = psql(
  `select coalesce(comparison,'-') || '|' || coalesce(version,'-') from suite_runs where prompt = '${promptId}' and comparison is not null order by created_at;`,
)
  .split("\n")
  .filter(Boolean);
check("A/B created two runs", pairs.length === 2, pairs.join(" "));
check("they share one comparison", new Set(pairs.map((row) => row.split("|")[0])).size === 1, pairs.join(" "));
check("each is pinned to a different version", new Set(pairs.map((row) => row.split("|")[1])).size === 2, pairs.join(" "));

// **Discriminated by the blok order, not by the expected blok.** An expected blok emits no text
// (`compile/emits-text.ts`), so it appears in no compiled prompt at all — the first version of this
// check looked for it in `prompt_text` and failed, which is how the `snapshotHash` defect above was
// found. What actually differs between v1 and v2 here is which blok comes first.
const sent = psql(
  `select left(replace(prompt_text, E'\n', ' '), 12) from suite_runs where prompt = '${promptId}' and comparison is not null order by created_at;`,
)
  .split("\n")
  .filter(Boolean);
check(
  "each run sent its own version's frozen prompt, not one recompile of the current canvas",
  new Set(sent).size === 2,
  sent.join(" / "),
);

const historyVersion = await page.locator(".runs-history-version").first().textContent();
check("the run history names the version and the A/B", (historyVersion ?? "").includes("one half of an A/B"), String(historyVersion).trim());

// ── Restore ─────────────────────────────────────────────────────────────────────────────────────
await page.goto(`/app/pr/${promptId}/versions`);
const beforeRestore = versions();
await page.getByRole("button", { name: "Restore Draft v1" }).click();
// The real condition: the restore mints a version, so the history grows.
await page.locator(".versions-list > li").nth(beforeRestore.length).waitFor();
await shoot(page, "after-restoring-draft-v1");

const afterRestore = versions();
check("restore added to the history and removed nothing", afterRestore.length > beforeRestore.length, `${beforeRestore.length} → ${afterRestore.length}`);
// Read from the **snapshot**, not the compiled text, for the same reason: the expected blok is in
// the blok set and in no compiled prompt. That it is in a snapshot at all is the `snapshotHash` fix.
const stillThere = psql(
  `select count(*) from prompt_versions where prompt = '${promptId}' and snapshot::text like '%valid JSON containing category%' and pinned_at is not null;`,
);
check("the work that was open when restore was pressed is still in the history, pinned", Number(stillThere) > 0, `${stillThere} pinned version(s)`);

// And the defect the drive found, asserted so it cannot come back: an expected blok reaches a
// version even though it changes no byte of the compiled prompt.
const inSnapshot = psql(
  `select count(*) from prompt_versions where prompt = '${promptId}' and snapshot::text like '%valid JSON containing category%';`,
);
check("an expected blok reaches the version history, though it emits no text", Number(inSnapshot) > 0, `${inSnapshot} version(s)`);

await page.goto(`/app/pr/${promptId}`);
await page.locator(".canvas-list > li").first().waitFor();
const cards = await page.locator(".canvas-list > li").count();
check("the canvas is back to the two bloks Draft v1 had", cards === 2, `${cards} cards`);
const canvasText = await page.locator(".canvas-list").textContent();
check("the blok added after v1 is gone from the canvas", !(canvasText ?? "").includes("valid JSON containing category"), "");
const softDeleted = psql(
  `select count(*) from bloks where prompt = '${promptId}' and deleted_at is not null;`,
);
check("and its row is soft-deleted, not deleted — restore never deletes", Number(softDeleted) === 1, `${softDeleted} soft-deleted`);
await shoot(page, "the-canvas-after-restore");

// ── Narrow, because the app chrome has wrapped below 414px before (BUG-069) ─────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`/app/pr/${promptId}/versions`);
await page.locator(".versions-list > li").first().waitFor();
const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("no horizontal overflow at 390px", !overflows);
const stacked = await page.evaluate(() => {
  const row = document.querySelector(".versions-row");
  return row === null ? "" : getComputedStyle(row).gridTemplateColumns;
});
check("the two columns become one on a phone", stacked.split(" ").length === 1, stacked);
await shoot(page, "the-versions-page-at-390px");

// ── Dark, because the token set is designed in parallel and only a render proves it ─────────────
//
// **Through the theme cookie, not by setting `data-theme` after the page has loaded.** `base.css`
// transitions `background` over 0.3s, so flipping the attribute and screenshotting immediately
// captures a blend of the two themes — the first attempt produced a "dark" screenshot with a light
// page background and text that looked like a contrast failure that does not exist. `canvas.spec.ts`
// has the same note and solves it with a wait; a cookie is better still, because the page is then
// server-rendered dark and there is no transition to wait for.
await page.setViewportSize({ width: 1440, height: 900 });
await page.context().addCookies([{ name: "41p-theme", value: "dark", url: BASE }]);
await page.goto(`/app/pr/${promptId}/versions`);
await page.locator(".versions-list > li").first().waitFor();
const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
check("the dark screenshot is actually dark, not a mid-transition blend", ground !== "rgb(239, 237, 230)", ground);
await shoot(page, "the-versions-page-in-dark");

console.log("\n" + (fail.length === 0 ? "DRIVE PASSED — every check" : `DRIVE FAILED — ${fail.join(", ")}`));

// Cleanup runs *after* the verification, never as an unconditional last act (EPIC-031a's lesson).
await browser.close();
cleanup();
process.exit(fail.length === 0 ? 0 : 1);
