import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { snapshot, type BlokKind, type PromptBlok } from "@41prompts/core";
import { createClient, type Client, type Warning } from "@41prompts/sdk";
import {
  DEFAULT_RUN_MODEL,
  HAS_TEST_DATABASE,
  RUN_PARAMS,
  announceDatabaseSkip,
  createApiKey,
  createDb,
  inputSets,
  newProjectId,
  newestVersion,
  projects,
  promptVersions,
  prompts,
  publishedArtifacts,
  suiteChecks,
  suiteResults,
  suiteRuns,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { resetLimitsForTest } from "@/lib/rate-limit";
import { publishVersion } from "./publish";
import { buildKey, databaseStore, markerKey } from "./store";

/**
 * **A mismatched build is refused at the seam** (EPIC-057 C6 — `docs/roadmap.md`'s Tests line,
 * *"rejected mismatched artifact"*).
 *
 * ## Why this is not `verify.test.ts`
 *
 * `packages/sdk-ts/src/verify.test.ts` already proves `checkArtifact` refuses a document whose hash
 * is wrong, and one that is intact but is not what the marker named. That is a unit test of a pure
 * function handed a string the test wrote itself, and it is not what the Tests line asks for.
 *
 * **Nothing had ever proved the refusal survives the seam.** Here the document is published by the
 * real publisher, stored in the real store, served by the real `/v1` route handlers, and read by a
 * real `@41prompts/sdk` client — and then one byte of the stored row is changed. EPIC-054's finding
 * 4.2 is the argument for doing it this way: every Python test injected its transport, so a defect
 * that lived *in* the transport was invisible to the entire suite until a real interpreter spoke to
 * a real server.
 *
 * ## `@41prompts/sdk` is a devDependency of this app for exactly this test
 *
 * It is a workspace package and it is **not** in `dependencies` — nothing this app *serves* imports
 * it. A repo-level test that crosses two packages has to live somewhere, and `apps/web` is the place
 * (`HANDOVER.md` lesson 28: a test in a public package may only read the public tree, and
 * `packages/sdk-ts` may not import `packages/db` at all under `CLAUDE.md` rule 11).
 *
 * ## The fetch here routes to the real handlers and is not a fake server
 *
 * It calls the route modules, follows the 302 the marker and build routes answer, and drops
 * `Authorization` when it does — which is what `fetch` genuinely does, measured in
 * `packages/sdk-ts/src/redirect.test.ts`. It is a transport, not a stand-in for the thing under
 * test: every status, header and byte comes from the handlers.
 */

const OWNER = "substitution-test-owner";

announceDatabaseSkip("the artifact-substitution suite");

interface Fixture {
  id: string;
  kind: BlokKind;
  text: string;
}

const CONTEXT: Fixture = { id: "b1", kind: "context", text: "You triage inbound support email." };
const EXPECTED: Fixture = { id: "b3", kind: "expected", text: "Respond with valid JSON." };

function frozen(bloks: readonly Fixture[]) {
  const promptBloks: PromptBlok[] = bloks.map((blok, order) => ({ ...blok, order }));
  return snapshot(promptBloks);
}

describe.skipIf(!HAS_TEST_DATABASE)("a mismatched build, at the seam", () => {
  let db: Db;
  let promptId: string;
  let projectId: string;
  let apiKey: string;
  let liveBuildHash: string;
  const clients: Client[] = [];

  beforeAll(() => {
    // The route handlers reach for `getDb()`, which reads this. Set before anything imports them.
    process.env.DATABASE_URL = testDatabaseUrl();
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
  }

  beforeEach(async () => {
    resetLimitsForTest();
    for (const client of clients.splice(0)) client.close();

    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "substitution-owner@example.test" });
    projectId = newProjectId();
    await db.insert(projects).values({ id: projectId, owner: OWNER, name: "P", slug: `p-${projectId}` });
    const [row] = await db.insert(prompts).values({ project: projectId, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;

    apiKey = (await createApiKey(db, { project: projectId, name: "drive", environment: "test" })).plaintext;

    // A real publish: a version, a passing suite over it, then the publisher itself. The marker and
    // the build in the store are whatever `publishVersion` wrote — not a fixture.
    await writeVersion([CONTEXT, EXPECTED]);
    const versionId = (await newestVersion(db, promptId))!.id;
    await runOver(versionId, [CONTEXT, EXPECTED], "pass");
    const published = await publishVersion({ db, promptId, owner: OWNER, targetModel: DEFAULT_RUN_MODEL });
    expect(published.ok, JSON.stringify(published)).toBe(true);
    if (!published.ok) return;
    liveBuildHash = published.value.artifact.buildHash;
  });

  afterAll(async () => {
    for (const client of clients.splice(0)) client.close();
    await clear();
  });

  async function writeVersion(bloks: readonly Fixture[], n = 1): Promise<void> {
    const { bloks: frozenBloks, compiledText } = frozen(bloks);
    await db.insert(promptVersions).values({
      prompt: promptId,
      n,
      snapshot: frozenBloks,
      compiledText,
      compiledHash: "x".repeat(64),
      snapshotHash: `${n}`.repeat(8),
    });
  }

  async function runOver(versionId: string, bloks: readonly Fixture[], outcome: "pass" | "fail"): Promise<void> {
    const [set] = await db
      .insert(inputSets)
      .values({ prompt: promptId, name: "inputs", columns: ["email"], rows: [["a@b.c"]], rowCount: 1 })
      .returning({ id: inputSets.id });

    const { compiledText } = frozen(bloks);
    const [run] = await db
      .insert(suiteRuns)
      .values({
        owner: OWNER,
        prompt: promptId,
        inputSet: set!.id,
        model: DEFAULT_RUN_MODEL,
        params: RUN_PARAMS,
        promptHash: "y".repeat(64),
        promptText: compiledText,
        state: "done",
        totalInputs: 1,
        completedInputs: 1,
        calls: 1,
        costCents: 3,
        version: versionId,
      })
      .returning({ id: suiteRuns.id });

    const [suiteCheck] = await db
      .insert(suiteChecks)
      .values({
        suiteRun: run!.id,
        checkId: "c1",
        blokId: EXPECTED.id,
        blokKind: "expected",
        blokText: EXPECTED.text,
        position: 0,
      })
      .returning({ id: suiteChecks.id });
    await db.insert(suiteResults).values({ suiteRun: run!.id, suiteCheck: suiteCheck!.id, inputIndex: 0, outcome });
  }

  /**
   * A `fetch` that dispatches to the real route handlers, following their redirects.
   *
   * The handlers are imported lazily because they read `process.env.DATABASE_URL` through `getDb()`
   * at call time and `beforeAll` sets it — an eager import here would be a module graph evaluated
   * before the value exists.
   */
  async function routedFetch(url: string, init?: { headers?: Record<string, string> }): Promise<Response> {
    const [{ GET: marker }, { GET: build }, { GET: blob }] = await Promise.all([
      import("@/app/v1/marker/[promptId]/route"),
      import("@/app/v1/build/[buildHash]/route"),
      import("@/app/v1/blob/[...key]/route"),
    ]);

    const request = new Request(url, { headers: init?.headers ?? {} });
    const path = new URL(url).pathname;

    const markerMatch = /^\/v1\/marker\/(.+)$/.exec(path);
    if (markerMatch) {
      return follow(await marker(request, { params: Promise.resolve({ promptId: decodeURIComponent(markerMatch[1]!) }) }), url);
    }
    const buildMatch = /^\/v1\/build\/(.+)$/.exec(path);
    if (buildMatch) {
      return follow(await build(request, { params: Promise.resolve({ buildHash: decodeURIComponent(buildMatch[1]!) }) }), url);
    }
    const blobMatch = /^\/v1\/blob\/(.+)$/.exec(path);
    if (blobMatch) {
      return blob(request, { params: Promise.resolve({ key: blobMatch[1]!.split("/") }) });
    }
    return new Response("Not found", { status: 404 });
  }

  /**
   * Follow a 302 the way `fetch` would, **without** the `Authorization` header.
   *
   * Same-origin here, so a real `fetch` would in fact keep it — the header is dropped anyway
   * because `/v1/blob` takes no key and a transport that carried one would be quietly testing a
   * different request than the CDN receives. `redirect.test.ts` measures what `fetch` does across a
   * real origin boundary; this is about the bytes, not about the header.
   */
  async function follow(response: Response, from: string): Promise<Response> {
    if (response.status !== 302) return response;
    const location = response.headers.get("location");
    if (location === null) return response;
    return routedFetch(new URL(location, from).toString());
  }

  function clientFor(onWarning: (warning: Warning) => void): Client {
    const client = createClient({
      apiKey,
      baseUrl: "https://app.41prompts.test",
      cacheDir: null,
      // A cast because `FetchLike` is a structural type over the subset of `fetch` the SDK calls,
      // and `routedFetch` returns a real `Response`, which satisfies it at runtime but is not
      // declared as it. The alternative is restating `FetchLike` here, which is a second copy.
      fetch: routedFetch as unknown as NonNullable<Parameters<typeof createClient>[0]>["fetch"],
      onWarning,
    });
    clients.push(client);
    return client;
  }

  /** The control, and every other test in this file depends on it being a real resolve. */
  it("resolves the published prompt through the real routes, with no warning", async () => {
    const warnings: Warning[] = [];
    const client = clientFor((warning) => warnings.push(warning));

    await client.refresh(promptId);
    const answer = client.resolve(promptId);

    expect(warnings, JSON.stringify(warnings)).toEqual([]);
    expect(answer.status).toBe("ok");
    expect(answer.buildHash).toBe(liveBuildHash);
    expect(answer.text).toContain("You triage inbound support email.");
    expect(answer.source).toBe("memory");
  });

  it("refuses a build whose stored bytes were changed by one byte", async () => {
    // One character, inside the compiled text, in the row the store serves from. The document is
    // still valid JSON and still names the right prompt — which is the point: the *only* thing that
    // catches it is the content address.
    const key = buildKey(liveBuildHash);
    const stored = await databaseStore.get(key);
    expect(stored, `nothing at ${key}`).toBeDefined();

    const tampered = stored!.body.replace("You triage", "You triaqe");
    expect(tampered).not.toBe(stored!.body);
    expect(tampered.length).toBe(stored!.body.length);
    await db.update(publishedArtifacts).set({ body: tampered }).where(eq(publishedArtifacts.key, key));

    const warnings: Warning[] = [];
    const client = clientFor((warning) => warnings.push(warning));
    await client.refresh(promptId);

    const mismatch = warnings.filter((warning) => warning.code === "hash_mismatch");
    expect(mismatch.length, JSON.stringify(warnings)).toBe(1);
    expect(mismatch[0]?.message).toContain("does not match its own content address");

    // And the refusal costs the caller a prompt rather than giving them a wrong one. `unavailable`
    // means `text` is `""`; it is never a degraded answer to be used anyway.
    const answer = client.resolve(promptId);
    expect(answer.status).toBe("unavailable");
    expect(answer.text).toBe("");
  });

  it("keeps serving what it already held when a later fetch is refused", async () => {
    // The property that matters to a customer: a tampered CDN must not take their application down
    // *or* change what their model reads. It should keep the last document it proved.
    const warnings: Warning[] = [];
    const client = clientFor((warning) => warnings.push(warning));

    await client.refresh(promptId);
    const before = client.resolve(promptId);
    expect(before.status).toBe("ok");

    const key = buildKey(liveBuildHash);
    const stored = await databaseStore.get(key);
    await db
      .update(publishedArtifacts)
      .set({ body: stored!.body.replace("You triage", "You triaqe") })
      .where(eq(publishedArtifacts.key, key));

    // A new marker, so the client re-fetches rather than answering 304 from its ETag.
    await bumpMarkerEtag();
    warnings.length = 0;
    await client.refresh(promptId);

    const after = client.resolve(promptId);
    expect(after.status).toBe("ok");
    expect(after.text).toBe(before.text);
    expect(after.buildHash).toBe(before.buildHash);
  });

  it("refuses a document that is intact but is not the one the marker names", async () => {
    // The second half of the roadmap's *"artifact sha verified against pointer"*, and the harder
    // one: a stale CDN edge, or a bucket prefix serving another environment, hands over a perfectly
    // genuine document from last week. Everything about it looks right.
    const key = buildKey(liveBuildHash);
    const stored = await databaseStore.get(key);

    // A real, self-consistent build for a different prompt, served under this build's key.
    const other = JSON.parse(stored!.body) as Record<string, unknown>;
    const { buildHashOf } = await import("@41prompts/core");
    const body = { ...other, promptId: "pr_99887766" };
    delete body["buildHash"];
    const reHashed = { ...body, buildHash: buildHashOf({ ...body, buildHash: "" } as never) };
    // Prove the substitute is itself intact, or this test would be re-proving the previous one.
    expect(buildHashOf(reHashed as never)).toBe(reHashed.buildHash);
    expect(reHashed.buildHash).not.toBe(liveBuildHash);

    await db
      .update(publishedArtifacts)
      .set({ body: JSON.stringify(reHashed) })
      .where(eq(publishedArtifacts.key, key));

    const warnings: Warning[] = [];
    const client = clientFor((warning) => warnings.push(warning));
    await client.refresh(promptId);

    const mismatch = warnings.filter((warning) => warning.code === "hash_mismatch");
    expect(mismatch.length, JSON.stringify(warnings)).toBe(1);
    expect(mismatch[0]?.message).toContain("is not the one the Live marker names");
  });

  it("refuses a marker that names another prompt", async () => {
    const key = markerKey(promptId);
    const stored = await databaseStore.get(key);
    const marker = JSON.parse(stored!.body) as Record<string, unknown>;
    await db
      .update(publishedArtifacts)
      .set({ body: JSON.stringify({ ...marker, promptId: "pr_99887766" }) })
      .where(eq(publishedArtifacts.key, key));

    const warnings: Warning[] = [];
    const client = clientFor((warning) => warnings.push(warning));
    await client.refresh(promptId);

    expect(warnings.map((one) => one.code)).toContain("malformed");
    expect(warnings.some((one) => one.message.includes("names a different prompt"))).toBe(true);
  });

  /** Change the marker's bytes so its derived ETag moves and a conditional request is not a 304. */
  async function bumpMarkerEtag(): Promise<void> {
    const key = markerKey(promptId);
    const stored = await databaseStore.get(key);
    const marker = JSON.parse(stored!.body) as Record<string, unknown>;
    await db
      .update(publishedArtifacts)
      .set({ body: JSON.stringify({ ...marker, publishedAt: "2026-09-17T00:00:01Z" }) })
      .where(eq(publishedArtifacts.key, key));
  }
});
