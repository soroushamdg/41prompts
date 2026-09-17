import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createApiKey, eq, prompts } from "./publish-db";
import { db, deleteTestUser } from "./db";
import { addBlok, newPrompt, signIn } from "./runs-helpers";

/**
 * Publishing, over HTTP, against the app that actually runs (EPIC-051).
 *
 * ## Why these assertions are made with `fetch` from inside the page
 *
 * This epic ships **no page and no component** — the Deploy page is EPIC-055's task line, verbatim.
 * What it ships is two cookie-authenticated endpoints and three key-authenticated ones, and the only
 * honest way to exercise a cookie-authenticated endpoint is with a real cookie, from a real origin,
 * against a real server. `page.evaluate(() => fetch(...))` is exactly that: the browser attaches the
 * session cookie it was given by a real sign-in and sets the `Origin` header itself.
 *
 * It is not a substitute for a browser drive of a feature. `scripts/drive-epic-051.mts` is the drive
 * and the report says which half each one covers.
 *
 * ## No worker is started, and the prompts here have no checks
 *
 * A checks row can only say `checks_passed` if a provider answered, and there is no provider key in
 * a test run. So the prompts here assert nothing, which makes their checks row `nothing_to_prove` —
 * a real and normal case (`Artifact.checkSuiteId` is null for exactly it). The failing paths are
 * proved in `lib/deploy/publish.test.ts` against seeded rows, where a run's outcomes can be written
 * without calling anybody.
 */

const OWNER_EMAIL = `publish-owner-${Date.now()}@example.test`;
const STRANGER_EMAIL = `publish-stranger-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-publish-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

interface ApiResult {
  status: number;
  body: Record<string, unknown>;
}

/** POST from inside the page, so the session cookie and the `Origin` header are the browser's own. */
async function post(page: Page, path: string, body: unknown): Promise<ApiResult> {
  return page.evaluate(
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
}

/** A publishable prompt: two bloks, no checks. Returns its id and its project's. */
async function publishable(page: Page, name: string): Promise<{ promptId: string; projectId: string }> {
  const promptId = await newPrompt(page, name);
  await addBlok(page, "context", "You triage inbound support email for Northwind.");
  await addBlok(page, "constraint", "Reply in at most 80 words.");
  const [row] = await db.select({ project: prompts.project }).from(prompts).where(eq(prompts.id, promptId));
  return { promptId, projectId: row!.project };
}

test.describe("publishing", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(await context.newPage(), OWNER_EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await deleteTestUser(OWNER_EMAIL);
    await deleteTestUser(STRANGER_EMAIL);
  });

  test.use({ storageState: STATE_FILE });

  test("publishes a version, moves Live, and serves the marker and the artifact", async ({ page, request }) => {
    const { promptId } = await publishable(page, "Publishable");

    const published = await post(page, `/api/prompts/${promptId}/publish`, {});
    expect(published.status).toBe(200);
    const live = published.body.live as Record<string, string>;
    expect(live.buildHash).toMatch(/^[0-9a-f]{64}$/);
    expect(live.kind).toBe("published");

    // C11, measured on a real HTTP response rather than asserted about a string.
    const marker = await request.get(live.markerUrl!);
    expect(marker.status()).toBe(200);
    expect(marker.headers()["cache-control"]).toBe("public, max-age=30");
    expect(await marker.json()).toMatchObject({ promptId, buildHash: live.buildHash, schemaVersion: 1, version: 1 });

    const artifact = await request.get(live.artifactUrl!);
    expect(artifact.status()).toBe(200);
    expect(artifact.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
    const document = (await artifact.json()) as Record<string, unknown>;
    expect(document.buildHash).toBe(live.buildHash);
    expect(document.promptId).toBe(promptId);
    expect(document.text).toContain("You triage inbound support email for Northwind.");
    // Nothing internal leaks: the artifact is public and carries no person and no account.
    expect(JSON.stringify(document)).not.toContain(OWNER_EMAIL);
  });

  test("undoes back to the previous build, with a reason", async ({ page }) => {
    const { promptId } = await publishable(page, "Undoable");

    const first = await post(page, `/api/prompts/${promptId}/publish`, {});
    expect(first.status).toBe(200);
    const firstHash = (first.body.live as Record<string, string>).buildHash;

    // A second version, through the canvas, so the version the drive publishes is one a person made.
    await page.goto(`/app/pr/${promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");
    const second = await post(page, `/api/prompts/${promptId}/publish`, {});
    expect(second.status).toBe(200);
    expect((second.body.live as Record<string, string>).buildHash).not.toBe(firstHash);

    const undone = await post(page, `/api/prompts/${promptId}/undo`, { reason: "latency spike on Gemini" });
    expect(undone.status).toBe(200);
    expect((undone.body.live as Record<string, string>).buildHash).toBe(firstHash);
    expect((undone.body.live as Record<string, string>).kind).toBe("undone");
  });

  test("refuses an undo with no reason worth recording", async ({ page }) => {
    const { promptId } = await publishable(page, "Reasonless");
    await post(page, `/api/prompts/${promptId}/publish`, {});

    const undone = await post(page, `/api/prompts/${promptId}/undo`, { reason: "oops" });
    expect(undone.status).toBe(400);
    expect(undone.body.error).toBe("reason_too_short");
  });

  // ── C8 ─────────────────────────────────────────────────────────────────────────────────────────

  test("answers 404 for another person's prompt, and never confirms it exists", async ({ page, browser }) => {
    const { promptId } = await publishable(page, "Private");

    const context = await browser.newContext();
    const stranger = await context.newPage();
    await signIn(stranger, STRANGER_EMAIL);

    const refused = await post(stranger, `/api/prompts/${promptId}/publish`, {});
    // 404, not 403: a 403 confirms the id exists. The same answer a prompt that never existed gives.
    expect(refused.status).toBe(404);
    const missing = await post(stranger, "/api/prompts/pr_deadbeef/publish", {});
    expect(missing.status).toBe(404);
    expect(refused.body.error).toBe(missing.body.error);
    await context.close();
  });

  test("refuses a POST from another origin, and one from no origin at all", async ({ page }) => {
    const { promptId } = await publishable(page, "CrossOrigin");
    const url = `/api/prompts/${promptId}/publish`;

    // The control, first: a same-origin POST from the page succeeds. Without it the two refusals
    // below would be satisfied by an endpoint that refuses everything.
    const allowed = await post(page, url, {});
    expect(allowed.status).toBe(200);

    // The shape a CSRF attempt has: our session cookie, somebody else's origin. `page.request`
    // shares the page's cookie jar, and a header set here is a header the server receives — which
    // a same-origin `fetch` cannot forge.
    const crossOrigin = await page.request.post(url, { data: {}, headers: { Origin: "https://evil.example" } });
    expect(crossOrigin.status()).toBe(403);
    expect((await crossOrigin.json()).error).toBe("bad_origin");

    // No `Origin` at all — a program rather than a browser. Refused too: `/v1` with a key is the
    // door for programs, and it has no cookie to steal.
    const noOrigin = await page.request.post(url, { data: {} });
    expect(noOrigin.status()).toBe(403);
  });

  // ── C9 and C10: the key-authenticated read API ─────────────────────────────────────────────────

  test("lists a project's prompts for its own key, and refuses another project's", async ({ page, request }) => {
    const mine = await publishable(page, "Mine");
    await post(page, `/api/prompts/${mine.promptId}/publish`, {});

    const theirs = await publishable(page, "Theirs");

    const { plaintext } = await createApiKey(db, { project: mine.projectId, name: "CI", environment: "live" });
    const bearer = { Authorization: `Bearer ${plaintext}` };

    const listed = await request.get("/v1/prompts", { headers: bearer });
    expect(listed.status()).toBe(200);
    const body = (await listed.json()) as { environment: string; prompts: { id: string; live: unknown }[] };
    expect(body.environment).toBe("live");
    expect(body.prompts.map((each) => each.id)).toContain(mine.promptId);
    // Another project's prompt is not merely unpublished here — it is absent.
    expect(body.prompts.map((each) => each.id)).not.toContain(theirs.promptId);

    // The marker redirects, and the artifact behind it is the CDN's to serve.
    const marker = await request.get(`/v1/marker/${mine.promptId}`, { headers: bearer, maxRedirects: 0 });
    expect(marker.status()).toBe(302);
    expect(marker.headers().location).toContain("/v1/blob/");

    // Wrong scope → 403, which is `docs/roadmap.md`'s own test. Not 404: an SDK that cannot tell a
    // misconfigured key from a deleted prompt cannot be debugged by the person who wired it up.
    const wrong = await request.get(`/v1/marker/${theirs.promptId}`, { headers: bearer, maxRedirects: 0 });
    expect(wrong.status()).toBe(403);
    expect((await wrong.json()).error).toBe("wrong_project");
  });

  test("refuses a request with no key, and one with a key nobody minted", async ({ request }) => {
    expect((await request.get("/v1/prompts")).status()).toBe(401);
    expect(
      (await request.get("/v1/prompts", { headers: { Authorization: "Bearer 41p_live_0123456789abcdef" } })).status(),
    ).toBe(401);
  });

  test("404s a prompt in this project that has never been published", async ({ page, request }) => {
    const unpublished = await publishable(page, "Unpublished");
    const { plaintext } = await createApiKey(db, {
      project: unpublished.projectId,
      name: "CI",
      environment: "test",
    });

    const marker = await request.get(`/v1/marker/${unpublished.promptId}`, {
      headers: { Authorization: `Bearer ${plaintext}` },
      maxRedirects: 0,
    });
    expect(marker.status()).toBe(404);
    expect((await marker.json()).error).toBe("not_published");
  });

  // ── EPIC-052, C14: the route that turns a content address into a URL ───────────────────────────

  test("redirects a published build to its bytes, and 404s one nothing published", async ({ page, request }) => {
    const mine = await publishable(page, "Buildable");
    const published = await post(page, `/api/prompts/${mine.promptId}/publish`, {});
    expect(published.status).toBe(200);
    const buildHash = (published.body.live as Record<string, string>).buildHash;

    const { plaintext } = await createApiKey(db, { project: mine.projectId, name: "SDK", environment: "live" });
    const bearer = { Authorization: `Bearer ${plaintext}` };

    const redirected = await request.get(`/v1/build/${buildHash}`, { headers: bearer, maxRedirects: 0 });
    expect(redirected.status()).toBe(302);
    expect(redirected.headers().location).toContain("/v1/blob/");

    // Followed, it is the artifact — which is the whole journey `@41prompts/sdk` makes.
    const artifact = await request.get(`/v1/build/${buildHash}`, { headers: bearer });
    expect(artifact.status()).toBe(200);
    expect(((await artifact.json()) as { buildHash: string }).buildHash).toBe(buildHash);
    expect(artifact.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

    // A hash nothing published. 64 hex characters, so this is a real content address and not a
    // malformed one — the 404 is about the audit log, not about the shape of the path.
    const unknown = await request.get(`/v1/build/${"0".repeat(64)}`, { headers: bearer, maxRedirects: 0 });
    expect(unknown.status()).toBe(404);
    expect((await unknown.json()).error).toBe("no_such_build");

    expect((await request.get(`/v1/build/${buildHash}`, { maxRedirects: 0 })).status()).toBe(401);
  });

  test("answers a conditional request for a Live marker with 304, and changes the tag when Live moves", async ({
    page,
    request,
  }) => {
    const mine = await publishable(page, "Conditional");
    const first = await post(page, `/api/prompts/${mine.promptId}/publish`, {});
    const markerUrl = (first.body.live as Record<string, string>).markerUrl!;

    const before = await request.get(markerUrl);
    const tag = before.headers()["etag"];
    expect(tag).toMatch(/^"[0-9a-f]{64}"$/);

    const again = await request.get(markerUrl, { headers: { "If-None-Match": tag! } });
    expect(again.status()).toBe(304);

    // Publish a second version and the tag must move. **This is the assertion the defect was
    // hiding**: the tag used to be derived from the key, and a marker's key is its prompt id, so it
    // could never change — every SDK in the field would have been served 304 for ever and no publish
    // would ever have reached a running application. EPIC-052 report §6a.
    await page.goto(`/app/pr/${mine.promptId}`);
    await addBlok(page, "constraint", "Never promise a refund.");
    const second = await post(page, `/api/prompts/${mine.promptId}/publish`, {});
    expect(second.status).toBe(200);

    const after = await request.get(markerUrl, { headers: { "If-None-Match": tag! } });
    expect(after.status()).toBe(200);
    expect(after.headers()["etag"]).not.toBe(tag);
    expect(((await after.json()) as { version: number }).version).toBe(2);
  });
});
