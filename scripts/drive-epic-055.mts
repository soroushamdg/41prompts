/**
 * EPIC-055's drive against the BUILT app on localhost, with the BUILT SDK.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web --filter=@41prompts/sdk
 *   # with apps/web/e2e/env.mjs's placeholders exported for port 3115:
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3115)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/55.env
 *   set -a && . /tmp/55.env && set +a
 *   pnpm --filter @41prompts/web start --port 3115 &
 *   npx tsx scripts/drive-epic-055.mts
 *
 * ## This is the first drive that mints its own key by clicking
 *
 * `drive-epic-051.mts` and `drive-epic-052.mts` both call `createApiKey` directly and say in their
 * headers that they do so **because there is no Settings → API keys tab**. There is now, and part 5
 * below uses it. That is not a tidy-up: it is the evidence that the tab works, and it is the only
 * assertion in this repository that a person can obtain a credential without a database client.
 *
 * ## What it covers and what it does not
 *
 * The pages, by hand, at 1440 and at 390, in both themes — and then the thing all of it is for: a
 * separate Node process loading the **built** `@41prompts/sdk` and resolving the prompt this drive
 * published, with the key this drive minted through the UI.
 *
 * It does not cover the image build, the Coolify environment, Traefik, or migrations against the
 * real database. Nothing is pushed (`CLAUDE.md`), so nothing deploys, and the report says so.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, never a persistent one, and every piece of data
 * built through the product's own UI.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Imported from inside `apps/web`, not from `scripts/`: the repository root is not a workspace
// package, so it cannot resolve `@41prompts/db` or `drizzle-orm` by name. `publish-db.ts` says why.
import { deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3115";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-055");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-055-${Date.now()}@example.com`;
const CACHE = mkdtempSync(join(tmpdir(), "41p-drive-055-cache-"));

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/** Run **first** and again at the end, so a drive whose browser died is self-healing. */
const tidy = deleteDriveUsers;

async function signIn(page: Page): Promise<void> {
  await page.goto(`${BASE}/sign-in?next=%2Fapp%2Fprojects`);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await page.getByRole("status").waitFor({ state: "visible", timeout: 15_000 });

  const token = await magicLinkTokenFor(EMAIL);
  if (token === undefined) throw new Error("no magic-link row for the drive's address");

  // The token never reaches the transcript: it goes from the row into a URL and nowhere else.
  await page.goto(`${BASE}/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await page.waitForURL(/\/app\/projects/, { timeout: 15_000 });
}

/** Add a blok the way a person does, and wait on the blok saying it saved. */
async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").waitFor({ state: "visible" });
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await page
    .locator(".canvas-list > li")
    .nth(before)
    .locator('.blok-editor-state[data-state="saved"]')
    .waitFor({ state: "attached", timeout: 15_000 });
}

/**
 * Answer the analytics banner, the way a person does before they start working.
 *
 * Not cosmetic. The banner is `position: fixed` across the bottom 117px of the viewport, so a
 * `fullPage` screenshot composites it into the middle of the image and every screenshot this drive
 * takes has a consent notice sitting across the page it is evidence for. EPIC-033's drive hit the
 * readable version of this — "a banner that was covering the evidence" — and the answer there was the
 * same: dismiss it first.
 *
 * **Decline rather than Allow**, because a drive is not a person consenting to being counted, and
 * because declining is the path that has to keep working for somebody who says no.
 */
async function answerConsent(page: Page): Promise<void> {
  const decline = page.getByRole("button", { name: "Decline" });
  if (await decline.isVisible().catch(() => false)) {
    await decline.click();
    await decline.waitFor({ state: "hidden", timeout: 10_000 });
  }
}

/** Every element that sticks out past the viewport, ignoring anything inside a scroll container. */
async function overflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
}

console.log(`cleaned up ${await tidy()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // ── 0. Prove the server is the build just made (HANDOVER lesson 17) ────────────────────────────

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  const buildId = (await import("node:fs")).readFileSync(join(ROOT, "apps/web/.next/BUILD_ID"), "utf-8").trim();
  const html = await page.content();
  record(
    "the server answering is the build just made",
    landing?.status() === 200 && html.includes(buildId),
    `BUILD_ID ${buildId} ${html.includes(buildId) ? "is" : "is NOT"} in the HTML`,
  );

  // ── 1. A prompt, built by clicking ─────────────────────────────────────────────────────────────

  await signIn(page);
  await answerConsent(page);
  record("the analytics banner can be declined", true, "declined, so it is not over the evidence below");

  await page.getByLabel("New project").fill(`Drive 055 ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/, { timeout: 15_000 });
  const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;

  await page.getByLabel("New prompt").fill("Refund classifier");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/, { timeout: 15_000 });
  const promptId = page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;

  await addBlok(page, "context", "You triage inbound refund requests for Northwind.");
  await addBlok(page, "constraint", "Address the writer as {{customer_name}} and reply in at most 80 words.");
  record("a project and a prompt were built by clicking", true, `${projectId} / ${promptId}`);

  // The editor header now names the version — C14, first half.
  const pill = (await page.locator(".app-state").textContent())?.trim() ?? "";
  record("the editor header names the Draft version", /^Draft v\d+$/.test(pill), `header says ${JSON.stringify(pill)}`);
  await page.screenshot({ path: join(SHOTS, "01-canvas-with-version-pill-1440.png") });

  // ── 2. Deploy, reached by the button rather than the URL ───────────────────────────────────────

  await page.getByRole("link", { name: "Publish…" }).click();
  await page.waitForURL(new RegExp(`/app/pr/${promptId}/deploy$`), { timeout: 15_000 });
  record("Publish… on the canvas reaches Deploy", true, `${BASE}/app/pr/${promptId}/deploy`);

  const rows = await page.locator(".deploy-row-verdict").allTextContents();
  record(
    "every gate row carries a word, not only a colour",
    rows.length === 4 && rows.every((word) => word.trim().length > 0),
    `${rows.length} rows: ${rows.map((r) => r.trim()).join(", ")}`,
  );
  await page.screenshot({ path: join(SHOTS, "02-deploy-nothing-live-1440.png"), fullPage: true });

  await page.getByRole("button", { name: /^Publish Draft v\d+ to Live$/ }).click();
  await page.locator(".deploy-env-live .deploy-env-version").waitFor({ state: "visible", timeout: 15_000 });
  const liveText = (await page.locator(".deploy-env-live .deploy-env-version").textContent())?.trim() ?? "";
  record("publishing moves Live and the card names it", /^Live v\d+$/.test(liveText), `Live card says ${liveText}`);
  await page.screenshot({ path: join(SHOTS, "03-deploy-live-and-history-1440.png"), fullPage: true });

  // ── 3. Break the contract, and watch every surface say so ──────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}`);
  await addBlok(page, "context", "Quote the order number {{order_id}} back to them.");
  await page.getByRole("tab", { name: "Variables" }).click();
  await page.getByRole("button", { name: "Declare order_id" }).click();
  await page
    .getByRole("region", { name: "Declared variables" })
    .getByText("order_id", { exact: true })
    .waitFor({ state: "visible", timeout: 15_000 });

  // The Runs page banner — C15.
  await page.goto(`${BASE}/app/pr/${promptId}/runs`);
  const bannerText = (await page.locator(".runs-blocked").textContent())?.trim() ?? "";
  record(
    "the Runs page says Live is blocked and why",
    bannerText.includes("This cannot go Live yet") && bannerText.includes("apps already in the field"),
    `banner says ${JSON.stringify(bannerText.slice(0, 90))}`,
  );
  await page.screenshot({ path: join(SHOTS, "04-runs-blocked-banner-1440.png") });

  // The Deploy page — C3.
  await page.goto(`${BASE}/app/pr/${promptId}/deploy`);
  const stopped = page.getByRole("button", { name: /^Stopped/ });
  const stoppedLabel = (await stopped.textContent())?.trim() ?? "";
  record(
    "Publish is disabled and says what is stopping it",
    (await stopped.isDisabled()) && stoppedLabel.length > "Stopped".length,
    `button reads ${JSON.stringify(stoppedLabel)}`,
  );
  await page.screenshot({ path: join(SHOTS, "05-deploy-blocked-1440.png"), fullPage: true });

  // ── 4. Publish anyway, then Undo ───────────────────────────────────────────────────────────────

  await page.getByRole("button", { name: "Publish anyway" }).click();
  await page.getByLabel(/Say why this is going Live/).fill("short");
  // The confirm, not the disclosure button — "Publish anyway" also ends in "anyway".
  const tooShort = await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).isDisabled();
  record("a reason under ten characters cannot be submitted", tooShort, "confirm stays disabled");

  await page.getByLabel(/Say why this is going Live/).fill("hotfix: the refund wording is wrong in production");
  await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).click();
  await page.locator(".deploy-history-anyway").waitFor({ state: "visible", timeout: 15_000 });
  const anyway = (await page.locator(".deploy-history-anyway").textContent())?.trim() ?? "";
  record(
    "Publish anyway records the reason in the history",
    anyway.includes("Published anyway") && anyway.includes("hotfix: the refund wording is wrong"),
    `row reads ${JSON.stringify(anyway.slice(0, 80))}`,
  );
  await page.screenshot({ path: join(SHOTS, "06-published-anyway-1440.png"), fullPage: true });

  const beforeUndo = (await page.locator(".deploy-env-live .deploy-env-version").textContent())?.trim() ?? "";
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await page.getByLabel(/Say why Live is going back/).fill("latency spike on Gemini after the change");
  await page.getByRole("button", { name: "Undo to the version before" }).click();
  await page
    .locator(".deploy-env-live .deploy-env-version")
    .filter({ hasNotText: beforeUndo })
    .waitFor({ state: "visible", timeout: 15_000 });
  const afterUndo = (await page.locator(".deploy-env-live .deploy-env-version").textContent())?.trim() ?? "";
  record("Undo moves Live back to the version before", afterUndo !== beforeUndo, `${beforeUndo} → ${afterUndo}`);
  await page.screenshot({ path: join(SHOTS, "07-after-undo-1440.png"), fullPage: true });

  // Publish the current draft properly, so the SDK below has the newest content to resolve. The
  // contract break is gone once the shipped version also requires order_id.
  await page.getByRole("button", { name: "Publish anyway" }).click();
  await page.getByLabel(/Say why this is going Live/).fill("the new input is intended; shipping it");
  await page.getByRole("button", { name: /^Publish Draft v\d+ anyway$/ }).click();
  await page.locator(".deploy-said").waitFor({ state: "visible", timeout: 15_000 });

  // ── 5. The key, minted by clicking. The first drive that can. ──────────────────────────────────

  await page.goto(`${BASE}/app/settings/keys`);
  await page.getByLabel(/^Name for a new key/).fill("drive-055");
  await page.getByRole("button", { name: "New key" }).click();
  await page.getByTestId("minted-key").waitFor({ state: "visible", timeout: 15_000 });
  const plaintext = (await page.getByTestId("minted-key").textContent())!.trim();
  record(
    "a key was minted through the product's own UI",
    /^41p_live_[0-9a-f]{32}$/.test(plaintext),
    `41p_live_…${plaintext.slice(-4)} — the first drive that did not reach into the database for one`,
  );
  await page.screenshot({ path: join(SHOTS, "08-key-shown-once-1440.png") });

  await page.reload();
  const afterReload = await page.content();
  record(
    "and is not shown again after a reload",
    !afterReload.includes(plaintext) && afterReload.includes(plaintext.slice(-4)),
    `the last four remain; the key itself is gone`,
  );

  // Rotate, and check the old one actually stops — the assertion that makes rotation worth having.
  const beforeRotate = await page.request.get(`${BASE}/v1/prompts`, {
    headers: { Authorization: `Bearer ${plaintext}` },
  });
  await page.getByRole("button", { name: "Rotate" }).click();
  await page.getByTestId("minted-key").waitFor({ state: "visible", timeout: 15_000 });
  const rotated = (await page.getByTestId("minted-key").textContent())!.trim();
  const afterRotate = await page.request.get(`${BASE}/v1/prompts`, {
    headers: { Authorization: `Bearer ${plaintext}` },
  });
  record(
    "rotating stops the old key and starts a new one",
    beforeRotate.status() === 200 && afterRotate.status() === 401 && rotated !== plaintext,
    `old key ${beforeRotate.status()} → ${afterRotate.status()}; new key ends …${rotated.slice(-4)}`,
  );
  await page.screenshot({ path: join(SHOTS, "09-keys-after-rotate-1440.png"), fullPage: true });

  // ── 6. Connect, and the file it writes ─────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/p/${projectId}`);
  await page.getByRole("link", { name: "Connect", exact: true }).click();
  await page.waitForURL(new RegExp(`/app/p/${projectId}/connect$`), { timeout: 15_000 });
  const generated = (await page.getByTestId("generated-file").textContent()) ?? "";
  // **Both names, asserted rather than described.** The first version of this check asserted only
  // the prompt id and the function name, while its detail string claimed a signature it had never
  // looked at — and the signature was wrong: it omitted `customer_name`, which the prompt uses and
  // nothing declares. A label is not an assertion, and this one hid the defect it was reporting.
  const signature = generated.split("\n").find((line) => line.startsWith("export function")) ?? "";
  record(
    "Connect generates a prompts.ts that can actually fill this prompt",
    generated.includes(`prompts.resolve("${promptId}"`) &&
      signature.includes("customer_name") &&
      signature.includes("order_id") &&
      !generated.includes("41p pull"),
    `signature: ${signature.trim()}`,
  );
  writeFileSync(join(SHOTS, "generated-prompts.ts.txt"), generated);
  await page.screenshot({ path: join(SHOTS, "10-connect-1440.png"), fullPage: true });

  // ── 7. The SDK, as a customer would load it, with the key from step 5 ──────────────────────────

  const { createClient } = (await import(
    join(ROOT, "packages", "sdk-ts", "dist", "index.js")
  )) as typeof import("../packages/sdk-ts/src/index.js");

  const sdk = createClient({
    apiKey: rotated,
    baseUrl: BASE,
    cacheDir: CACHE,
    onWarning: () => undefined,
  });
  await sdk.refresh(promptId);
  const resolved = sdk.resolve(promptId, { customer_name: "Ada", order_id: "NW-4417" });
  record(
    "the built SDK resolves the prompt using the key minted through the UI",
    resolved.status === "ok" && resolved.text.includes("Ada") && resolved.text.includes("NW-4417"),
    `status ${resolved.status}, source ${resolved.source}, ${resolved.text.length} chars`,
  );
  writeFileSync(join(SHOTS, "resolved.txt"), resolved.text);
  sdk.close();

  // ── 8. 390px and dark, for every page this epic ships ──────────────────────────────────────────

  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, url] of [
    ["deploy", `/app/pr/${promptId}/deploy`],
    ["connect", `/app/p/${projectId}/connect`],
    ["keys", `/app/settings/keys`],
    ["publishing", `/app/settings/publishing`],
  ] as const) {
    await page.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
    const over = await overflow(page);
    record(`${name} fits a 390px viewport`, over <= 1, `overflow ${over}px`);
    await page.screenshot({ path: join(SHOTS, `11-${name}-390.png`), fullPage: true });
  }

  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/pr/${promptId}/deploy`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "12-deploy-dark-1440.png"), fullPage: true });
  await page.goto(`${BASE}/app/settings/keys`, { waitUntil: "networkidle" });
  await page.screenshot({ path: join(SHOTS, "13-keys-dark-1440.png"), fullPage: true });
  record("dark theme renders both new pages", true, "screenshots 12 and 13");
} finally {
  await browser.close();
  console.log(`cleaned up ${await tidy()} drive account(s) at the end`);
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
if (failed.length > 0) {
  for (const result of failed) console.log(`  FAILED: ${result.name} — ${result.detail}`);
  process.exit(1);
}
