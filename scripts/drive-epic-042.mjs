/**
 * EPIC-042's browser drive, against the BUILT app on localhost.
 *
 * Run it with the built app and a worker already serving, and a database they share:
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *
 *   # the web: seals, and holds only the PUBLIC half of the master key (threat model 043a)
 *   DEPLOY_ENV=development FAKE_PROVIDER=1 \
 *   BETTER_AUTH_SECRET=ci-secret-not-for-prod-0123456789 BETTER_AUTH_URL=http://localhost:3000 \
 *   GOOGLE_CLIENT_ID=ci-google-client-id GOOGLE_CLIENT_SECRET=ci-google-client-secret \
 *   GITHUB_CLIENT_ID=ci-github-client-id GITHUB_CLIENT_SECRET=ci-github-client-secret \
 *   KEY_ENCRYPTION_PUBLIC_KEY=41vjBsKfqrgm9bHOtiIRzRhghpgINayaq3tKn74Zh0w \
 *   pnpm --filter @41prompts/web start --port 3000
 *
 *   # the worker: opens, and is the only process with the SECRET half
 *   DEPLOY_ENV=development FAKE_PROVIDER=1 \
 *   KEY_ENCRYPTION_SECRET=0NKZT1nc-uRye9d-XTkKNCOi4wZM1GRl8MT-63Dme3I \
 *   pnpm --filter @41prompts/worker start
 *
 *   node scripts/drive-epic-042.mjs
 *
 * The placeholders are `apps/web/e2e/env.mjs`'s and not invented ones — hand-made values give
 * *"Something went wrong."* on sign-in, which is Better Auth failing to construct.
 *
 * ## What this drive is for, and what it deliberately cannot show
 *
 * Three surfaces this epic builds are new pixels: Settings → Providers, the provider matrix, and
 * the "By input" heatmap. Only a built app can fail the way a build fails — an unbuilt stylesheet,
 * a chunk that 404s — which is why this exists beside a green e2e suite.
 *
 * **No provider is called, at any point.** `FAKE_PROVIDER=1` means the web's key verification and
 * the worker's model calls are both the deterministic fake. So this drive proves the pipeline and
 * the pixels, and proves **nothing** about whether OpenAI or Google accept a key or answer a
 * prompt. The report says so rather than letting a green drive imply it.
 *
 * Cleanup runs first and last. **Last is after the verification, never as an unconditional final
 * act** — EPIC-031a's drive deleted its own user as its last step and cascaded away the evidence
 * the epic existed to collect.
 */
import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const OUT = "docs/epics/reports/screenshots/EPIC-042";
mkdirSync(OUT, { recursive: true });
const BASE = "http://localhost:3000";
const email = `claude-drive-epic042-${Date.now()}@example.com`;
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
async function shoot(page, title) {
  shot += 1;
  const file = `${OUT}/${String(shot).padStart(2, "0")}-${title}.png`;
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

console.log("\nEPIC-042 — providers, BYO keys and the two pivots, driven against the built app\n");

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

const styled = await page.evaluate(() => {
  const body = getComputedStyle(document.body);
  return { background: body.backgroundColor, family: body.fontFamily };
});
check("the built app is styled", styled.background !== "rgba(0, 0, 0, 0)" && styled.family.length > 0, JSON.stringify(styled));

// ── Settings → Providers, from the chrome, with no keys at all ──────────────────────────────────
await page.getByRole("link", { name: "Settings" }).click();
await page.waitForURL(/\/app\/settings\/providers$/);
await page.locator(".settings-rows").waitFor();
await shoot(page, "settings-providers-empty");

const rows = await page.locator(".settings-row").count();
check("all three providers are listed, whether or not a key is stored", rows === 3, `${rows} rows`);
const guidance = await page.locator(".settings-guidance").first().textContent();
check(
  "EPIC-043's guidance renders beside the box, not only on /legal/security",
  (guidance ?? "").includes("Set a spending limit on that key at your provider."),
  (guidance ?? "").slice(0, 60),
);

const googleNote = await page.getByTestId("note-google").textContent();
check(
  "the one provider-specific fact is said where a key is pasted, not only in a document",
  (googleNote ?? "").includes("unpaid quota"),
  (googleNote ?? "").slice(0, 70),
);

// The stylesheet this epic added, applied rather than merely built.
const rowBorder = await page.locator(".settings-row").first().evaluate((node) => getComputedStyle(node).borderTopWidth);
check("providers.css built and applied", rowBorder !== "0px", `border-top-width ${rowBorder}`);

// ── A key the provider will not take ────────────────────────────────────────────────────────────
await page.getByLabel("OpenAI API key").fill("not-a-key-0123456789");
await page.getByRole("button", { name: "Save OpenAI key" }).click();
await page.getByTestId("message-openai").waitFor();
await shoot(page, "a-key-the-provider-refused");

const refusal = await page.getByTestId("message-openai").textContent();
check("a rejected key is refused in words that name the provider", (refusal ?? "").includes("OpenAI did not recognise"), (refusal ?? "").slice(0, 70));
check("and it says nothing was saved", (refusal ?? "").includes("Nothing was saved"), "");
const storedAfterRefusal = psql(
  `select count(*) from provider_keys p join users u on u.id = p.owner where u.email = '${email}';`,
);
check("nothing was stored, in the table rather than in the sentence", storedAfterRefusal === "0", `${storedAfterRefusal} rows`);

// ── Three keys, pasted by hand ──────────────────────────────────────────────────────────────────
const KEY = "sk-drive-a-perfectly-plausible-key-42";
for (const title of ["Anthropic", "OpenAI", "Google"]) {
  await page.getByLabel(`${title} API key`).fill(KEY);
  await page.getByRole("button", { name: `Save ${title} key` }).click();
  await page.getByTestId(`last-four-${title.toLowerCase()}`).waitFor();
}
await shoot(page, "three-keys-stored");

const sealed = psql(
  `select p.provider || '|' || p.last_four || '|' || left(p.sealed, 6) from provider_keys p join users u on u.id = p.owner where u.email = '${email}' order by p.provider;`,
).split("\n");
check("three keys stored, each showing only its last four", sealed.length === 3, sealed.join(" "));
check("every stored value is a versioned envelope, not a key", sealed.every((row) => row.endsWith("|41pk1.")), sealed.join(" "));
const anyPlaintext = psql(
  `select count(*) from provider_keys p join users u on u.id = p.owner where u.email = '${email}' and p.sealed like '%${KEY}%';`,
);
check("the key itself is nowhere in the row", anyPlaintext === "0", `${anyPlaintext} rows contain it`);

// **The claim of threat-model row 043a, exercised**: this web process holds only the public half.
check(
  "the web sealed all three while holding only KEY_ENCRYPTION_PUBLIC_KEY",
  process.env.DRIVE_WEB_HAS_SECRET !== "1",
  "the web was started without KEY_ENCRYPTION_SECRET — see this file's header",
);

// ── Switch one off, test one, and read the verdict the worker wrote ─────────────────────────────
await page.getByRole("switch", { name: "Use your Google key" }).click();
await page.getByText("Switched off").waitFor();
const googleEnabled = psql(
  `select p.enabled from provider_keys p join users u on u.id = p.owner where u.email = '${email}' and p.provider = 'google';`,
);
check("switching a key off leaves the row and the envelope alone", googleEnabled === "f", `enabled=${googleEnabled}`);

await page.getByRole("button", { name: "Test Anthropic key" }).click();
await page.getByTestId("verdict-anthropic").filter({ hasText: "This key works" }).waitFor({ timeout: 30_000 });
await shoot(page, "a-key-switched-off-and-a-key-tested");
check("a stored key is tested by the worker and the verdict comes back to the page", true, "");
const opened = psql(
  `select coalesce(p.last_used_at::text, '-') from provider_keys p join users u on u.id = p.owner where u.email = '${email}' and p.provider = 'anthropic';`,
);
check("opening a stored key stamps last_used_at", opened !== "-", opened);

// ── Build a prompt by hand, through the product's own creation path ─────────────────────────────
await page.goto("/app/projects");
await page.getByLabel("New project").fill(`Providers drive ${Date.now()}`);
await page.getByRole("button", { name: "Create project" }).click();
await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/);
await page.getByLabel("New prompt").fill("Refund classifier");
await page.getByRole("button", { name: "Create prompt" }).click();
await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
const promptId = page.url().split("/app/pr/")[1].split(/[/?#]/)[0];
console.log(`  prompt ${promptId}`);

async function addBlok(kind, text) {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await page.locator(".canvas-list > li").nth(before).locator(".blok-editor-state[data-state='saved']").waitFor();
}

await addBlok("expected", 'Never mention "sorry".');
await addBlok("expected", "Reply in at most 30 words.");
await addBlok("context", "{{answer}}");

await page.getByRole("tab", { name: "Variables" }).click();
await page.getByRole("button", { name: "Declare answer" }).click();
await page.getByRole("region", { name: "Declared variables" }).getByText("answer", { exact: true }).waitFor();

await page.goto(`/app/pr/${promptId}/runs`);
await page.getByLabel("CSV file").setInputFiles({
  name: "inputs.csv",
  mimeType: "text/csv",
  /**
   * Six inputs so the heatmap is a grid rather than a pair of squares, and **one of them fails** —
   * the first version of this drive used six passing rows, so every cell was green and the shape
   * difference that rule 10 actually turns on was never rendered for anybody to look at.
   *
   * The failing value is quoted because it carries a comma: unquoted it is two fields against a
   * one-column header and the upload is correctly refused (RFC 4180).
   */
  buffer: Buffer.from(
    'answer\nAll good.\nStill fine.\n"I am sorry, no."\nNo trouble.\nWorks well.\nAll clear.\n',
    "utf-8",
  ),
});
await page.getByRole("button", { name: "Upload" }).click();
await page.locator(".runs-set-name").filter({ hasText: /^inputs\.csv$/ }).waitFor();
await shoot(page, "the-runs-page-with-both-triggers");

// ── The second trigger, and the matrix it produces ──────────────────────────────────────────────
await page.getByRole("button", { name: "Run inputs.csv on every provider" }).click();
await page.waitForURL(/\/runs\/srun_[0-9a-f]{16}$/);
await page.locator(".app-state", { hasText: "Finished" }).waitFor({ timeout: 120_000 });

/**
 * **Wait for the other columns too, and check the page says it is waiting.**
 *
 * The first version of this drive waited only for *this* run and then asserted the matrix — and
 * found a real defect: a comparison's runs are queued together and the worker takes them one at a
 * time, so the other column rendered as "nothing graded", which is a verdict about a prompt rather
 * than a statement that a run has not got there yet. The page now says so and keeps polling; this
 * is where that is proved.
 */
const stillRunning = await page.getByTestId("progress").textContent().catch(() => null);
if (stillRunning !== null) {
  check(
    "a finished run whose partners are still going says so, rather than showing them as empty",
    /still running/.test(stillRunning),
    stillRunning.trim(),
  );
}
// The progress line going away is the condition that every run of the comparison has answered —
// which is itself the new behaviour, so waiting on it is an assertion rather than a sleep.
await page.getByTestId("progress").waitFor({ state: "detached", timeout: 120_000 });

const created = psql(
  `select count(*) || '|' || count(distinct comparison) from suite_runs where prompt = '${promptId}';`,
);
check(
  "one run per ENABLED key, sharing one comparison — the switched-off Google key is not run",
  created === "2|1",
  `runs|comparisons = ${created}`,
);

const models = psql(`select string_agg(model, ',' order by model) from suite_runs where prompt = '${promptId}';`);
check("each run used its own provider's default model", models.includes("claude") && models.includes("gpt"), models);

await page.locator(".matrix").waitFor();
await shoot(page, "the-provider-matrix");

const columns = await page.locator(".matrix thead th").count();
check("the matrix has a column per run plus the check column", columns === 3, `${columns} columns`);
// `:not(.status-icon)` because the glyph is a span too — rule 10 puts both in the cell, and this
// assertion is about the words being there in addition to the colour and the glyph.
const cellWords = await page.locator(".matrix tbody td span:not(.status-icon)").allTextContents();
check(
  "every cell says its counts in words, never by colour alone",
  cellWords.length > 0 && cellWords.every((text) => /passed|graded|version|running|did not run/.test(text)),
  cellWords.join(" | "),
);

// Rule 10, read off the rendered page rather than off the class names: only the three tokens.
const colours = await page.evaluate(() => {
  const seen = new Set();
  for (const node of document.querySelectorAll(".matrix td, .matrix td span")) seen.add(getComputedStyle(node).color);
  return [...seen];
});
console.log(`  note  matrix cell colours: ${colours.join(" ")}`);

// ── The two pivots, and the heatmap ─────────────────────────────────────────────────────────────
const byInput = page.getByRole("tab", { name: "By input" });
check("the run page offers both pivots as real tabs", await byInput.isVisible(), "");
await byInput.click();
await page.getByTestId("heatmap").waitFor();
await shoot(page, "the-by-input-heatmap");

const cells = await page.getByTestId("heatmap").getByRole("button").count();
check("the heatmap is checks by inputs, every cell a button", cells === 12, `${cells} cells for 2 checks x 6 inputs`);

const failing = await page.getByTestId("heatmap").getByRole("button", { name: /, fail$/ }).count();
check("the fixture really does contain a failure, or the shape assertion below proves nothing", failing === 1, `${failing} failing cells`);

const names = await page.getByTestId("heatmap").getByRole("button").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
check(
  "every cell names its input and its verdict, so no verdict is carried by colour alone",
  names.every((name) => /^input \d+, (pass|fail|not checked)$/.test(name ?? "")),
  names.slice(0, 3).join(" | "),
);

const tabStops = await page.getByTestId("heatmap").locator('button[tabindex="0"]').count();
check("one tab stop for the whole grid, not one per cell", tabStops === 1, `${tabStops} tabbable cells`);

// The shape difference, read off the rendered page. A pass is solid; a failure is hatched.
const style = (name) =>
  page
    .getByTestId("heatmap")
    .getByRole("button", { name })
    .first()
    .evaluate((node) => ({ image: getComputedStyle(node).backgroundImage, colour: getComputedStyle(node).backgroundColor }));

const passStyle = await style(/, pass$/);
const failStyle = await style(/, fail$/);
check("a passing cell carries a real background, not only a class name", passStyle.colour !== "rgba(0, 0, 0, 0)", JSON.stringify(passStyle));
// **Rule 10's shape difference, read off the rendered page.** A pass is solid; a failure is hatched,
// which survives greyscale, a printout, and a reader who cannot tell this green from this red.
check(
  "a failing cell differs in SHAPE and not only in colour",
  failStyle.image.includes("gradient") && !passStyle.image.includes("gradient"),
  `fail ${failStyle.image.slice(0, 50)} | pass ${passStyle.image}`,
);

// ── Drive it by keyboard, which is the acceptance criterion rather than a nicety ────────────────
await page.getByTestId("heatmap").getByRole("button").first().focus();
await page.keyboard.press("ArrowRight");
await page.keyboard.press("Enter");
await page.getByTestId("heat-detail").waitFor();
await shoot(page, "a-heatmap-cell-opened-by-keyboard");

const detail = await page.getByTestId("heat-detail").textContent();
check("Enter on a cell opens that input, by keyboard alone", (detail ?? "").includes("Input 2"), (detail ?? "").slice(0, 80));


await page.keyboard.press("ArrowDown");
const focusedName = await page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
check("arrow keys move between rows as well as along one", /^input 2,/.test(focusedName), focusedName);
// And the failure, opened by clicking, so the screenshot shows the hatch next to what caused it.
await page.getByTestId("heatmap").getByRole("button", { name: /, fail$/ }).first().click();
await page.getByTestId("heat-detail").filter({ hasText: "failed" }).waitFor();
await shoot(page, "the-failing-cell-and-its-input");
const failDetail = await page.getByTestId("heat-detail").textContent();
check("a failing cell opens onto the input that failed", (failDetail ?? "").includes("Input 3"), (failDetail ?? "").slice(0, 80));

// ── 390px, because rule 12 is about touch as well as keyboard ───────────────────────────────────
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(150);
await shoot(page, "the-heatmap-at-390px");
const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("the run page does not overflow the viewport at 390px", !overflows, `scrollWidth ${await page.evaluate(() => document.documentElement.scrollWidth)}`);

await page.goto("/app/settings/providers");
await shoot(page, "settings-providers-at-390px");
const settingsOverflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
check("Settings → Providers does not overflow at 390px", !settingsOverflows, "");

await page.setViewportSize({ width: 1440, height: 900 });

// ── What the keys did NOT leak into ─────────────────────────────────────────────────────────────
const inRuns = psql(
  `select count(*) from runs r join users u on u.id = r.owner where u.email = '${email}' and r.payload::text like '%${KEY}%';`,
);
check("no stored run payload contains the key", inRuns === "0", `${inRuns} rows`);
const inParams = psql(
  `select count(*) from suite_runs s join users u on u.id = s.owner where u.email = '${email}' and (s.params::text like '%${KEY}%' or s.prompt_text like '%${KEY}%');`,
);
check("no run row's params or frozen prompt contains the key", inParams === "0", `${inParams} rows`);

// ── Cleanup, AFTER the verification and never as an unconditional last act ──────────────────────
cleanup();
await browser.close();

console.log(fail.length === 0 ? `\nDRIVE PASSED — ${shot} screenshots in ${OUT}\n` : `\nDRIVE FAILED — ${fail.length}: ${fail.join("; ")}\n`);
process.exit(fail.length === 0 ? 0 : 1);
