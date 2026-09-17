/**
 * EPIC-052's drive against the BUILT app on localhost, with the BUILT SDK.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web --filter=@41prompts/sdk
 *   # with apps/web/e2e/env.mjs's placeholders exported for port 3112:
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3112)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/52.env
 *   set -a && . /tmp/52.env && set +a
 *   pnpm --filter @41prompts/web start --port 3112 &
 *   # prove the server you are about to drive is the one you just built (HANDOVER lesson 17):
 *   curl -s localhost:3112/healthz
 *   npx tsx scripts/drive-epic-052.mts
 *
 * ## What this covers, and what it does not
 *
 * EPIC-052 ships **one route and no page**, so the *visual* half is the EPIC-030 shape: the built app
 * is loaded and probed for styling as a build-regression check, and the report says which it is.
 *
 * What it does ship is a **library**, and a library's drive is a real process importing the real
 * built package. Part 4 below is that: `dist/index.js`, loaded as a customer would load it, against a
 * prompt this drive published a moment earlier through the product's own UI, with a real API key over
 * real HTTP. It is the only part of this epic that can fail the way an `npm install` fails.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, never a persistent one, and the data built through
 * the product's own UI. The one exception is the API key, because there is no Settings → API keys tab
 * to click yet — EPIC-055 owns that — so it is minted directly and the report says so.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Imported from inside `apps/web`, not from `scripts/`: the repository root is not a workspace
// package, so it cannot resolve `@41prompts/db` or `drizzle-orm` by name. `publish-db.ts` says why.
import { createApiKey, db, deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3112";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-052");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-052-${Date.now()}@example.com`;
// The SDK's disk cache goes to a temporary directory, not under `docs/`. The screenshots directory
// is evidence a person reads; a cache is a working file, and `docs/PROCESS.md`'s rule about suites
// writing into the working tree is about exactly that distinction.
const CACHE = mkdtempSync(join(tmpdir(), "41p-drive-052-cache-"));

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

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

const post = (page: Page, path: string, body: unknown): Promise<ApiResult> =>
  page.evaluate(
    async ([url, payload]) => {
      const response = await fetch(url as string, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload as string,
      });
      return { status: response.status, body: (await response.json()) as Record<string, unknown> };
    },
    [path, JSON.stringify(body)],
  );

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

console.log(`cleaned up ${await tidy()} leftover drive account(s) before starting`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

try {
  // ── 1. The build-regression half ───────────────────────────────────────────────────────────────

  const landing = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  record("the landing page responds", landing?.status() === 200, `HTTP ${String(landing?.status())}`);

  const styled = await page.evaluate(() => ({
    ink: getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim(),
    absent: getComputedStyle(document.documentElement).getPropertyValue("--no-such-token").trim(),
    background: getComputedStyle(document.body).backgroundColor,
  }));
  record(
    "it is styled, not bare HTML",
    styled.ink !== "" && styled.background !== "rgba(0, 0, 0, 0)",
    `--color-ink = ${JSON.stringify(styled.ink)}, body background = ${styled.background}`,
  );
  // The control, so a wrong token name cannot report a styled page as unstyled (EPIC-050's lesson 13).
  record("the probe can fail: an absent token reads empty", styled.absent === "", `--no-such-token = ""`);

  // ── 2. A prompt with a variable in it, built by clicking ───────────────────────────────────────

  await signIn(page);
  await page.getByLabel("New project").fill(`Drive 052 ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/, { timeout: 15_000 });
  const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;

  await page.getByLabel("New prompt").fill("Support triage");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/, { timeout: 15_000 });
  const promptId = page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;

  await addBlok(page, "context", "You triage inbound support email for Northwind.");
  // The variable is the point: this drive is about the SDK binding it, so the prompt has to have one
  // and it has to get there the way a customer's would.
  await addBlok(page, "constraint", "Address the writer as {{customer_name}} and reply in at most 80 words.");
  record("a project and a prompt were built through the product's own UI", true, `${projectId} / ${promptId}`);
  await page.screenshot({ path: join(SHOTS, "canvas-with-variable-1440.png") });

  // ── 3. Publish, from inside the page ───────────────────────────────────────────────────────────

  const published = await post(page, `/api/prompts/${promptId}/publish`, {});
  const live = (published.body.live ?? {}) as Record<string, string>;
  record(
    "publishing moves Live",
    published.status === 200 && /^[0-9a-f]{64}$/.test(live.buildHash ?? ""),
    `HTTP ${published.status}, buildHash ${(live.buildHash ?? "—").slice(0, 12)}…, v${String(live.version)}`,
  );

  const { plaintext } = await createApiKey(db, { project: projectId, name: "Drive 052", environment: "live" });
  const bearer = { Authorization: `Bearer ${plaintext}` };

  // ── 4. The new route, and the ETag defect it exposed ───────────────────────────────────────────

  const buildRedirect = await page.request.get(`${BASE}/v1/build/${live.buildHash}`, {
    headers: bearer,
    maxRedirects: 0,
  });
  record(
    "GET /v1/build redirects a content address to where its bytes are",
    buildRedirect.status() === 302 && (buildRedirect.headers().location ?? "").includes("/v1/blob/"),
    `HTTP ${buildRedirect.status()} → ${buildRedirect.headers().location ?? "(none)"}`,
  );

  const unknownBuild = await page.request.get(`${BASE}/v1/build/${"0".repeat(64)}`, {
    headers: bearer,
    maxRedirects: 0,
  });
  record(
    "a content address nothing published is 404, not a redirect to nothing",
    unknownBuild.status() === 404,
    `HTTP ${unknownBuild.status()}`,
  );

  const markerOnce = await page.request.get(`${BASE}${live.markerUrl}`);
  const tag = markerOnce.headers()["etag"] ?? "";
  const conditional = await page.request.get(`${BASE}${live.markerUrl}`, { headers: { "If-None-Match": tag } });
  record(
    "a conditional request for the Live marker is answered 304",
    tag !== "" && conditional.status() === 304,
    `etag ${tag || "(none)"} → HTTP ${conditional.status()}`,
  );

  // ── 5. The SDK, as a customer would load it ────────────────────────────────────────────────────

  // The built package, by the path `publishConfig` names — not `src/`. A drive of a library is a
  // drive of the file in the tarball.
  const { createClient } = (await import(join(ROOT, "packages", "sdk-ts", "dist", "index.js"))) as typeof import("../packages/sdk-ts/src/index.js");

  const warnings: { code: string; message: string }[] = [];
  const sdk = createClient({
    apiKey: plaintext,
    baseUrl: BASE,
    cacheDir: CACHE,
    onWarning: (warning) => warnings.push({ code: warning.code, message: warning.message }),
  });

  const cold = sdk.resolve(promptId, { customer_name: "Ada" });
  record(
    "the first call on a cold process returns without waiting for the network",
    cold.status === "unavailable" && cold.source === "none",
    `status ${cold.status}, source ${cold.source}`,
  );

  await sdk.refresh(promptId);
  const warm = sdk.resolve(promptId, { customer_name: "Ada" });
  record(
    "after one refresh it resolves the Live prompt with the variable bound",
    warm.status === "ok" &&
      warm.source === "memory" &&
      warm.text.includes("Address the writer as Ada") &&
      warm.buildHash === live.buildHash,
    `status ${warm.status}, source ${warm.source}, v${String(warm.version)}, ${warm.text.length} chars`,
  );
  writeFileSync(join(SHOTS, "resolved.txt"), warm.text);

  const missing = sdk.resolve(promptId, {});
  record(
    "a missing required variable is refused rather than shipped with a hole in it",
    missing.status === "unavailable" && missing.missing.includes("customer_name") && missing.text === "",
    `status ${missing.status}, missing [${missing.missing.join(", ")}]`,
  );

  // ── 6. Publish again, and watch a running process pick it up ───────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}`);
  await addBlok(page, "constraint", "Never promise a refund. Say a human will confirm it.");
  const second = await post(page, `/api/prompts/${promptId}/publish`, {});
  const secondLive = (second.body.live ?? {}) as Record<string, string>;
  record(
    "a second version publishes to a different address",
    second.status === 200 && secondLive.buildHash !== live.buildHash,
    `${(secondLive.buildHash ?? "—").slice(0, 12)}… vs ${(live.buildHash ?? "—").slice(0, 12)}…`,
  );

  // Stale first: the same client still answers with what it holds, without waiting.
  const stale = sdk.resolve(promptId, { customer_name: "Ada" });
  record(
    "the running process serves the old version while the new one is unfetched",
    stale.buildHash === live.buildHash,
    `still ${String(stale.buildHash).slice(0, 12)}…, v${String(stale.version)}`,
  );

  await sdk.refresh(promptId);
  const refreshed = sdk.resolve(promptId, { customer_name: "Ada" });
  record(
    "and picks the new one up without a restart or a redeploy",
    refreshed.buildHash === secondLive.buildHash && refreshed.text.includes("Never promise a refund"),
    `now ${String(refreshed.buildHash).slice(0, 12)}…, v${String(refreshed.version)}`,
  );

  // ── 7. The service stops, and the app still answers ────────────────────────────────────────────

  // The demo `docs/roadmap.md` names for Stage 5a, run for real: a second client with a dead network
  // and nothing bundled, reading the disk cache the first one wrote.
  const offline = createClient({
    apiKey: plaintext,
    baseUrl: "http://127.0.0.1:1/",
    cacheDir: CACHE,
    onWarning: () => undefined,
  });
  const fromDisk = offline.resolve(promptId, { customer_name: "Ada" });
  record(
    "a new process with no network resolves from the disk cache",
    fromDisk.status === "ok" && fromDisk.source === "disk" && fromDisk.buildHash === secondLive.buildHash,
    `status ${fromDisk.status}, source ${fromDisk.source}`,
  );
  offline.close();

  // And with neither network nor cache, what the deploy bundled.
  const bundledOnly = createClient({
    apiKey: plaintext,
    baseUrl: "http://127.0.0.1:1/",
    cacheDir: null,
    bundled: [JSON.parse(await (await page.request.get(`${BASE}${live.artifactUrl}`)).text()) as unknown],
    onWarning: () => undefined,
  });
  const fromBundle = bundledOnly.resolve(promptId, { customer_name: "Ada" });
  record(
    "with no network and no cache, it resolves what the deploy bundled",
    fromBundle.status === "ok" && fromBundle.source === "bundled",
    `status ${fromBundle.status}, source ${fromBundle.source}`,
  );
  bundledOnly.close();

  // Two warnings are provoked on purpose above — the cold call before anything is cached, and the
  // deliberate call with no value for a required variable — so the assertion is that **only** those
  // two happened. A bare "no warnings" would have been the wrong assertion and the first run of this
  // drive made it: it failed on the SDK behaving exactly as the two checks above require.
  const EXPECTED = new Set(["not_found", "missing_variables"]);
  const unexpected = warnings.filter((warning) => !EXPECTED.has(warning.code));
  record(
    "the SDK warned only about the two things this drive provoked on purpose",
    unexpected.length === 0 && warnings.some((warning) => warning.code === "missing_variables"),
    warnings.length === 0
      ? "no warnings at all, which means the control did not fire"
      : `${warnings.map((w) => w.code).join(", ")}${unexpected.length === 0 ? "" : ` — unexpected: ${unexpected.map((w) => w.message).join("; ")}`}`,
  );
  writeFileSync(join(SHOTS, "warnings.json"), JSON.stringify(warnings, null, 2));
  sdk.close();

  // ── 8. The versions the publishes left behind ──────────────────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}/versions`);
  await page.getByRole("heading", { name: "Versions", level: 1 }).waitFor({ state: "visible", timeout: 15_000 });
  await page.screenshot({ path: join(SHOTS, "versions-1440.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS, "versions-390.png") });
} finally {
  await browser.close();
  // Verify, then tidy. EPIC-031a's drive cascaded away its own evidence before it had been read.
  console.log(`cleaned up ${await tidy()} drive account(s) afterwards`);
}

const failed = results.filter((one) => !one.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
if (failed.length > 0) process.exit(1);
