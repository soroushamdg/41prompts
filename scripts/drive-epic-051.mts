/**
 * EPIC-051's drive against the BUILT app on localhost.
 *
 *   docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
 *     -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
 *   export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
 *   npx turbo run build --filter=@41prompts/web
 *   # with apps/web/e2e/env.mjs's placeholders exported for port 3111:
 *   node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3111)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/51.env
 *   set -a && . /tmp/51.env && set +a
 *   pnpm --filter @41prompts/web start --port 3111 &
 *   npx tsx scripts/drive-epic-051.mts
 *
 * ## What this covers, and what it does not
 *
 * EPIC-051 ships **no page and no component** — the Deploy page is EPIC-055's task line, verbatim.
 * So the *visual* half of this is the EPIC-030 shape: the built app is started and a page is loaded
 * as a build-regression check, and the report says which it is.
 *
 * What is not the EPIC-030 shape is the behaviour. Publishing is reachable over HTTP from a signed-in
 * session, so the drive signs in as a fresh throwaway user, **builds the prompt by clicking**, and
 * then calls the endpoints from inside the page — the browser's own cookie, the browser's own origin,
 * the real built server. That is what EPIC-055's button will do.
 *
 * `docs/AUTONOMOUS.md`: a fresh user every drive, never a persistent one, and the data built through
 * the product's own UI. The one exception is the API key, because there is no Settings → API keys tab
 * to click yet; it is minted directly and the report says so.
 */
import { chromium, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Imported from inside `apps/web`, not from `scripts/`: the repository root is not a workspace
// package, so it cannot resolve `@41prompts/db` or `drizzle-orm` by name. `publish-db.ts` says why.
import { createApiKey, db, deleteDriveUsers, magicLinkTokenFor } from "../apps/web/e2e/publish-db";

const BASE = process.env.DRIVE_URL ?? "http://localhost:3111";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = join(ROOT, "docs", "epics", "reports", "screenshots", "EPIC-051");
mkdirSync(SHOTS, { recursive: true });

const EMAIL = `claude-drive-051-${Date.now()}@example.com`;

const results: { name: string; ok: boolean; detail: string }[] = [];
const record = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} — ${detail}`);
};

/**
 * Run **first** and again at the end, so a drive whose browser died is self-healing rather than
 * something the next run has to notice. `publish-db.ts` has the statement and its two guards.
 */
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

  // ── 2. A prompt, built by clicking ─────────────────────────────────────────────────────────────

  await signIn(page);
  await page.getByLabel("New project").fill(`Drive 051 ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/\/app\/p\/proj_[0-9a-f]{4}/, { timeout: 15_000 });
  const projectId = page.url().split("/app/p/")[1]!.split(/[/?#]/)[0]!;

  await page.getByLabel("New prompt").fill("Support triage");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/app\/pr\/pr_[0-9a-f]{8}/, { timeout: 15_000 });
  const promptId = page.url().split("/app/pr/")[1]!.split(/[/?#]/)[0]!;

  await addBlok(page, "context", "You triage inbound support email for Northwind.");
  await addBlok(page, "constraint", "Reply in at most 80 words.");
  record("a project and a prompt were built through the product's own UI", true, `${projectId} / ${promptId}`);
  await page.screenshot({ path: join(SHOTS, "canvas-before-publish-1440.png") });

  // ── 3. Publish, from inside the page ───────────────────────────────────────────────────────────

  const published = await post(page, `/api/prompts/${promptId}/publish`, {});
  const live = (published.body.live ?? {}) as Record<string, string>;
  record(
    "publishing moves Live",
    published.status === 200 && /^[0-9a-f]{64}$/.test(live.buildHash ?? ""),
    `HTTP ${published.status}, buildHash ${(live.buildHash ?? "—").slice(0, 12)}…, v${String(live.version)}`,
  );

  const gate = published.body.gate as { blocked: boolean; rows: { kind: string; verdict: string; says: string }[] };
  record(
    "the gate answered four rows and did not stop it",
    gate?.blocked === false && gate.rows.length === 4,
    gate === undefined ? "no gate in the response" : gate.rows.map((row) => `${row.kind}:${row.verdict}`).join(" "),
  );

  // ── 4. The headers, on real HTTP responses ─────────────────────────────────────────────────────

  const marker = await page.request.get(`${BASE}${live.markerUrl}`);
  const markerCache = marker.headers()["cache-control"];
  record(
    "the marker is served with a 30-second max-age",
    marker.status() === 200 && markerCache === "public, max-age=30",
    `HTTP ${marker.status()}, cache-control: ${markerCache ?? "(none)"}`,
  );

  const artifact = await page.request.get(`${BASE}${live.artifactUrl}`);
  const artifactCache = artifact.headers()["cache-control"];
  record(
    "the artifact is served immutable",
    artifact.status() === 200 && artifactCache === "public, max-age=31536000, immutable",
    `HTTP ${artifact.status()}, cache-control: ${artifactCache ?? "(none)"}`,
  );

  const document_ = (await artifact.json()) as Record<string, unknown>;
  record(
    "the artifact is the v1 document, addressed by its own hash",
    document_.schemaVersion === 1 && document_.buildHash === live.buildHash && document_.promptId === promptId,
    `schemaVersion ${String(document_.schemaVersion)}, promptId ${String(document_.promptId)}`,
  );
  record(
    "nothing internal is in it",
    !JSON.stringify(document_).includes(EMAIL) && !JSON.stringify(document_).includes(projectId),
    "no address and no project id in the published bytes",
  );
  writeFileSync(join(SHOTS, "artifact.json"), JSON.stringify(document_, null, 2));
  writeFileSync(join(SHOTS, "marker.json"), await marker.text());

  // ── 5. Undo, and the history ───────────────────────────────────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}`);
  await addBlok(page, "constraint", "Never promise a refund. Say a human will confirm it.");
  const second = await post(page, `/api/prompts/${promptId}/publish`, {});
  const secondLive = (second.body.live ?? {}) as Record<string, string>;
  record(
    "a second version publishes to a different address",
    second.status === 200 && secondLive.buildHash !== live.buildHash,
    `${(secondLive.buildHash ?? "—").slice(0, 12)}… vs ${(live.buildHash ?? "—").slice(0, 12)}…`,
  );

  const short = await post(page, `/api/prompts/${promptId}/undo`, { reason: "oops" });
  record(
    "an undo with no reason worth recording is refused",
    short.status === 400 && short.body.error === "reason_too_short",
    `HTTP ${short.status}, ${String(short.body.error)}`,
  );

  const undone = await post(page, `/api/prompts/${promptId}/undo`, { reason: "latency spike on Gemini" });
  const undoneLive = (undone.body.live ?? {}) as Record<string, string>;
  record(
    "Undo puts the previous build back",
    undone.status === 200 && undoneLive.buildHash === live.buildHash && undoneLive.kind === "undone",
    `HTTP ${undone.status}, back to ${(undoneLive.buildHash ?? "—").slice(0, 12)}…`,
  );

  const markerAfter = await page.request.get(`${BASE}${live.markerUrl}`);
  const markerJson = (await markerAfter.json()) as Record<string, unknown>;
  record(
    "the marker follows the undo, so apps in the field learn about it",
    markerJson.buildHash === live.buildHash,
    `marker now names ${String(markerJson.buildHash).slice(0, 12)}…`,
  );

  // ── 6. The key-authenticated read API ──────────────────────────────────────────────────────────

  // Minted directly: there is no Settings → API keys tab yet (EPIC-055's task line), so there is
  // nothing to click. Every other piece of state in this drive was built through the product.
  const { plaintext } = await createApiKey(db, { project: projectId, name: "Drive 051", environment: "live" });
  const bearer = { Authorization: `Bearer ${plaintext}` };

  const listed = await page.request.get(`${BASE}/v1/prompts`, { headers: bearer });
  const listing = (await listed.json()) as { environment: string; prompts: { id: string; live: unknown }[] };
  record(
    "GET /v1/prompts lists this project's prompts and what is Live",
    listed.status() === 200 && listing.prompts.some((each) => each.id === promptId && each.live !== null),
    `HTTP ${listed.status()}, ${listing.prompts.length} prompt(s), environment ${listing.environment}`,
  );

  const redirect = await page.request.get(`${BASE}/v1/marker/${promptId}`, { headers: bearer, maxRedirects: 0 });
  record(
    "GET /v1/marker redirects to where the marker is served",
    redirect.status() === 302 && (redirect.headers().location ?? "").includes("/v1/blob/"),
    `HTTP ${redirect.status()} → ${redirect.headers().location ?? "(none)"}`,
  );

  const noKey = await page.request.get(`${BASE}/v1/prompts`);
  record("a request with no key is refused", noKey.status() === 401, `HTTP ${noKey.status()}`);

  // ── 7. The history the publishes left behind ───────────────────────────────────────────────────

  await page.goto(`${BASE}/app/pr/${promptId}/versions`);
  await page.getByRole("heading", { name: "Versions", level: 1 }).waitFor({ state: "visible", timeout: 15_000 });

  /**
   * **This is the assertion that found the defect, and it is the reason it is here.**
   *
   * The first run of this drive published twice and the page still showed one `Draft v1`: publishing
   * did not pin, so `prompt_versions` rule 2 rewrote the open draft in place and the blok set the
   * first publish event names had been silently replaced by the second's. Two publishes of different
   * content must leave two versions.
   */
  const versionNames = await page.locator(".versions-item-name").allTextContents();
  record(
    "two publishes of different content leave two versions",
    versionNames.length === 2 && versionNames[0] === "Draft v2" && versionNames[1] === "Draft v1",
    versionNames.join(", ") || "no versions listed",
  );

  await page.screenshot({ path: join(SHOTS, "versions-after-publish-1440.png") });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS, "versions-after-publish-390.png") });
} finally {
  await browser.close();
  // Verify, then tidy. EPIC-031a's drive cascaded away its own evidence before it had been read.
  console.log(`cleaned up ${await tidy()} drive account(s) afterwards`);
}

const failed = results.filter((one) => !one.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
if (failed.length > 0) process.exit(1);
