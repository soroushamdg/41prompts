import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { createDb, type Db } from "./client";
import { newProjectId } from "./ids";
import { projects, prompts, publishedArtifacts, publishEvents, users } from "./schema";
import {
  ImmutableObjectChangedError,
  getObject,
  liveFor,
  liveForProject,
  previousLiveFor,
  publishHistory,
  putObject,
  recordPublishEvent,
  type NewPublishEvent,
} from "./publishes";
import {
  apiKeyForPlaintext,
  apiKeysForProject,
  createApiKey,
  environmentOfPlaintext,
  hashApiKey,
  markApiKeyUsed,
  newApiKeyPlaintext,
  revokeApiKey,
  rotateApiKey,
} from "./api-keys";

const OWNER = "publishes-test-owner";
/** A second account, so "the actor left" can be tested without also deleting the project. */
const ACTOR = "publishes-test-actor";

announceDatabaseSkip("the publishes suite");

/**
 * Like `versions.test.ts`, this file does not import `@41prompts/core`. `recordPublishEvent` stores
 * a `buildHash` and a gate report it has no opinion about; making these assertions depend on the
 * artifact assembler would mean a change to the compiler failing the audit log's suite.
 */
const GATE = { rows: [], blocked: false };

describe.skipIf(!HAS_TEST_DATABASE)("publishes", () => {
  let db: Db;
  let promptId: string;
  let otherPromptId: string;
  let projectId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
    await db.delete(users).where(eq(users.id, ACTOR));
    await db.delete(publishedArtifacts).where(eq(publishedArtifacts.key, "test/artifacts/a.json"));
    await db.delete(publishedArtifacts).where(eq(publishedArtifacts.key, "test/markers/m.json"));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "publishes-owner@example.test" });
    await db.insert(users).values({ id: ACTOR, name: ACTOR, email: "publishes-actor@example.test" });
    projectId = newProjectId();
    await db.insert(projects).values({ id: projectId, owner: OWNER, name: "P", slug: `p-${projectId}` });
    const [one] = await db.insert(prompts).values({ project: projectId, name: "Router" }).returning({ id: prompts.id });
    const [two] = await db.insert(prompts).values({ project: projectId, name: "Second" }).returning({ id: prompts.id });
    promptId = one!.id;
    otherPromptId = two!.id;
  });

  afterAll(clear);

  const event = (over: Partial<NewPublishEvent> = {}): NewPublishEvent => ({
    prompt: promptId,
    version: null,
    versionN: 1,
    buildHash: "a".repeat(64),
    kind: "published",
    actor: OWNER,
    reason: null,
    gate: GATE,
    ...over,
  });

  // Rows are ordered by `created_at` and then by `id`; `defaultNow()` inside one transaction can
  // give two rows the same timestamp, so tests that care about order write explicit times.
  const at = (seconds: number) => new Date(Date.UTC(2026, 8, 17, 12, 0, seconds));
  const write = (over: Partial<NewPublishEvent>, when: Date) =>
    db
      .insert(publishEvents)
      .values({ ...event(over), createdAt: when })
      .returning({ id: publishEvents.id });

  describe("what is Live", () => {
    it("is nothing until something is published", async () => {
      expect(await liveFor(db, promptId)).toBeUndefined();
    });

    it("is the newest event, whatever kind it is", async () => {
      await write({ buildHash: "1".repeat(64), versionN: 1 }, at(1));
      await write({ buildHash: "2".repeat(64), versionN: 2 }, at(2));

      expect((await liveFor(db, promptId))?.buildHash).toBe("2".repeat(64));

      // An undo is an event, not an edit. The log stays append-only and the newest row is the answer.
      await write({ buildHash: "1".repeat(64), versionN: 1, kind: "undone", reason: "latency on Gemini" }, at(3));
      const live = await liveFor(db, promptId);
      expect(live?.buildHash).toBe("1".repeat(64));
      expect(live?.kind).toBe("undone");
      expect(await publishHistory(db, promptId)).toHaveLength(3);
    });

    it("is scoped to its own prompt", async () => {
      await write({ buildHash: "1".repeat(64) }, at(1));
      expect(await liveFor(db, otherPromptId)).toBeUndefined();
    });
  });

  describe("what an undo would go back to", () => {
    it("is nothing when nothing has been published", async () => {
      expect(await previousLiveFor(db, promptId)).toBeUndefined();
    });

    it("is nothing after a single publish: there is no earlier artifact", async () => {
      await write({ buildHash: "1".repeat(64) }, at(1));
      expect(await previousLiveFor(db, promptId)).toBeUndefined();
    });

    it("is the previous artifact", async () => {
      await write({ buildHash: "1".repeat(64), versionN: 1 }, at(1));
      await write({ buildHash: "2".repeat(64), versionN: 2 }, at(2));
      expect((await previousLiveFor(db, promptId))?.buildHash).toBe("1".repeat(64));
    });

    /**
     * The case that makes this "the previous artifact" rather than "the previous row". Re-publishing
     * the artifact that is already Live writes a second row naming the same bytes; stepping back one
     * row would then undo to what is already Live — doing nothing while reporting success.
     */
    it("skips past rows that name the artifact already Live", async () => {
      await write({ buildHash: "1".repeat(64), versionN: 1 }, at(1));
      await write({ buildHash: "2".repeat(64), versionN: 2 }, at(2));
      await write({ buildHash: "2".repeat(64), versionN: 2, kind: "published_anyway", reason: "re-proved on a new suite" }, at(3));

      expect((await previousLiveFor(db, promptId))?.buildHash).toBe("1".repeat(64));
    });
  });

  describe("the log records the decision", () => {
    it("keeps the reason and the gate it went past", async () => {
      const gate = { blocked: true, rows: [{ kind: "checks", verdict: "fail", reason: "checks_failed" }] };
      const row = await recordPublishEvent(
        db,
        event({ kind: "published_anyway", reason: "hotfix, chargeback wording wrong", gate }),
      );

      expect(row.kind).toBe("published_anyway");
      expect(row.reason).toBe("hotfix, chargeback wording wrong");
      // Not a summary and not a boolean: an exception whose record does not say what was excepted is
      // an exception nobody can review, and it cannot be re-derived later.
      expect(row.gate).toEqual(gate);
      expect(row.actor).toBe(OWNER);
    });

    /**
     * `actor` is `set null`, not `cascade`, for the reason `suite_runs.version` is: the act happened,
     * and a history that erases itself when somebody leaves is not a history.
     *
     * The actor here is a **second** account rather than the project's owner, because deleting the
     * owner takes the project, the prompt and therefore the event with it — which would test the
     * prompt's cascade and say nothing about this column. The first version of this test did exactly
     * that and failed, which is how the distinction got written down.
     */
    it("survives the actor being deleted", async () => {
      await recordPublishEvent(db, event({ actor: ACTOR }));
      await db.delete(users).where(eq(users.id, ACTOR));

      const [row] = await db.select().from(publishEvents).where(eq(publishEvents.prompt, promptId));
      expect(row).toBeDefined();
      expect(row?.actor).toBeNull();
      expect(row?.buildHash).toBe("a".repeat(64));
    });
  });

  describe("liveForProject", () => {
    it("lists every prompt, with Live where there is one and undefined where there is not", async () => {
      await write({ buildHash: "7".repeat(64), versionN: 3 }, at(1));

      const rows = await liveForProject(db, projectId);
      expect(rows.map((row) => row.id).sort()).toEqual([promptId, otherPromptId].sort());

      const mine = rows.find((row) => row.id === promptId);
      const theirs = rows.find((row) => row.id === otherPromptId);
      expect(mine?.live?.buildHash).toBe("7".repeat(64));
      expect(mine?.live?.versionN).toBe(3);
      // The control: a prompt with no publish must come back present-and-unpublished, not missing.
      expect(theirs).toBeDefined();
      expect(theirs?.live).toBeUndefined();
    });
  });

  describe("the store's rows", () => {
    const object = (body: string) => ({
      key: "test/artifacts/a.json",
      contentType: "application/json",
      cacheControl: "public, max-age=31536000, immutable",
      body,
    });

    it("stores and reads back the exact bytes", async () => {
      await putObject(db, object('{"a":1}'), { immutable: true });
      expect(await getObject(db, "test/artifacts/a.json")).toMatchObject({
        body: '{"a":1}',
        cacheControl: "public, max-age=31536000, immutable",
      });
    });

    it("treats an identical immutable repeat as a no-op", async () => {
      await putObject(db, object('{"a":1}'), { immutable: true });
      await expect(putObject(db, object('{"a":1}'), { immutable: true })).resolves.toBeUndefined();
      expect((await getObject(db, "test/artifacts/a.json"))?.body).toBe('{"a":1}');
    });

    it("refuses to change an immutable key's bytes", async () => {
      await putObject(db, object('{"a":1}'), { immutable: true });
      await expect(putObject(db, object('{"a":2}'), { immutable: true })).rejects.toBeInstanceOf(
        ImmutableObjectChangedError,
      );
      // The positive control for the refusal: the original must still be there, unchanged.
      expect((await getObject(db, "test/artifacts/a.json"))?.body).toBe('{"a":1}');
    });

    it("overwrites a mutable key, which is what a marker is for", async () => {
      const marker = (hash: string) => ({
        key: "test/markers/m.json",
        contentType: "application/json",
        cacheControl: "public, max-age=30",
        body: `{"buildHash":"${hash}"}`,
      });
      await putObject(db, marker("one"), { immutable: false });
      await putObject(db, marker("two"), { immutable: false });
      expect((await getObject(db, "test/markers/m.json"))?.body).toBe('{"buildHash":"two"}');
    });

    it("reads back nothing for a key nobody wrote", async () => {
      expect(await getObject(db, "test/artifacts/never-written.json")).toBeUndefined();
    });
  });

  describe("api keys", () => {
    it("mints a plaintext that says its environment, and stores only a digest", async () => {
      const { key, plaintext } = await createApiKey(db, { project: projectId, name: "CI", environment: "test" });

      expect(plaintext.startsWith("41p_test_")).toBe(true);
      expect(environmentOfPlaintext(plaintext)).toBe("test");
      expect(key.environment).toBe("test");
      expect(key.lastFour).toBe(plaintext.slice(-4));

      // Nothing in the row is the key. The control below proves this search can find a plaintext.
      const [stored] = await db.select().from(await Promise.resolve((await import("./schema")).apiKeys));
      expect(JSON.stringify(stored)).not.toContain(plaintext);
      expect(JSON.stringify({ ...stored, leaked: plaintext })).toContain(plaintext);
      expect(stored?.hashedKey).toBe(hashApiKey(plaintext));
    });

    it("finds the key a request presented, and refuses a revoked one", async () => {
      const { key, plaintext } = await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });
      expect((await apiKeyForPlaintext(db, plaintext))?.id).toBe(key.id);

      const { apiKeys } = await import("./schema");
      await db.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, key.id));
      expect(await apiKeyForPlaintext(db, plaintext)).toBeUndefined();
    });

    it("refuses a key that is not one of ours without querying at all", async () => {
      expect(environmentOfPlaintext("sk-live-whatever")).toBeUndefined();
      expect(environmentOfPlaintext("41p_staging_deadbeef")).toBeUndefined();
      expect(await apiKeyForPlaintext(db, "41p_staging_deadbeef")).toBeUndefined();
      expect(await apiKeyForPlaintext(db, newApiKeyPlaintext("live"))).toBeUndefined();
    });

    it("records use separately from reading", async () => {
      const { key, plaintext } = await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });
      expect((await apiKeyForPlaintext(db, plaintext))?.lastUsedAt).toBeNull();

      await markApiKeyUsed(db, key.id, at(9));
      expect((await apiKeyForPlaintext(db, plaintext))?.lastUsedAt?.getTime()).toBe(at(9).getTime());
    });

    it("lists a project's keys", async () => {
      await createApiKey(db, { project: projectId, name: "CI", environment: "test" });
      await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });
      const listed = await apiKeysForProject(db, projectId);
      expect(listed.map((row) => row.environment).sort()).toEqual(["live", "test"]);
    });

    it("mints a different value every time", async () => {
      const values = new Set([newApiKeyPlaintext("live"), newApiKeyPlaintext("live"), newApiKeyPlaintext("live")]);
      expect(values.size).toBe(3);
    });

    // ── EPIC-055: revoke, and rotation as two rows ───────────────────────────────────────────────

    it("revokes a key, idempotently, and only through its own project", async () => {
      const { key, plaintext } = await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });

      // The control: the lookup this test is about to assert *fails* is proved to succeed first.
      // Without it, a revoke that did nothing and a lookup that never worked look identical.
      expect((await apiKeyForPlaintext(db, plaintext))?.id).toBe(key.id);

      expect(await revokeApiKey(db, { project: "proj_ffff", keyId: key.id })).toBe(false);
      expect((await apiKeyForPlaintext(db, plaintext))?.id).toBe(key.id);

      expect(await revokeApiKey(db, { project: projectId, keyId: key.id })).toBe(true);
      expect(await apiKeyForPlaintext(db, plaintext)).toBeUndefined();

      // Pressing it twice is not an error; it is a second answer to the same question.
      expect(await revokeApiKey(db, { project: projectId, keyId: key.id })).toBe(false);
    });

    it("rotates into two rows, keeping the old one's dates", async () => {
      const { key: old, plaintext: oldPlaintext } = await createApiKey(db, {
        project: projectId,
        name: "Prod",
        environment: "live",
      });
      await markApiKeyUsed(db, old.id, at(9));

      expect((await apiKeyForPlaintext(db, oldPlaintext))?.id).toBe(old.id);

      const rotated = await rotateApiKey(db, { project: projectId, keyId: old.id }, at(20));
      expect(rotated).toBeDefined();

      // The old plaintext stops working; the new one starts. Both directions, because a rotation
      // that revoked without minting and one that minted without revoking are different bugs.
      expect(await apiKeyForPlaintext(db, oldPlaintext)).toBeUndefined();
      expect((await apiKeyForPlaintext(db, rotated!.plaintext))?.id).toBe(rotated!.key.id);

      // The name and the environment carry over: rotation replaces a credential, not its purpose.
      expect(rotated!.key.name).toBe("Prod");
      expect(rotated!.key.environment).toBe("live");
      expect(rotated!.key.id).not.toBe(old.id);

      // Two rows, and the revoked one still explains itself. This is the whole of ruling 6: an
      // in-place update would leave `created_at` describing a credential that no longer exists.
      const listed = await apiKeysForProject(db, projectId);
      expect(listed).toHaveLength(2);
      const kept = listed.find((row) => row.id === old.id);
      expect(kept?.revokedAt?.getTime()).toBe(at(20).getTime());
      expect(kept?.createdAt.getTime()).toBe(old.createdAt.getTime());
      expect(kept?.lastUsedAt?.getTime()).toBe(at(9).getTime());
      expect(kept?.lastFour).toBe(old.lastFour);
    });

    it("refuses to rotate a key that is not this project's, or is already revoked", async () => {
      const { key } = await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });

      expect(await rotateApiKey(db, { project: "proj_ffff", keyId: key.id })).toBeUndefined();
      // Still one row: a refused rotation mints nothing.
      expect(await apiKeysForProject(db, projectId)).toHaveLength(1);

      await revokeApiKey(db, { project: projectId, keyId: key.id });
      expect(await rotateApiKey(db, { project: projectId, keyId: key.id })).toBeUndefined();
      expect(await apiKeysForProject(db, projectId)).toHaveLength(1);
    });

    it("rotates twice into three rows", async () => {
      const { key } = await createApiKey(db, { project: projectId, name: "Prod", environment: "live" });
      const first = await rotateApiKey(db, { project: projectId, keyId: key.id }, at(20));
      const second = await rotateApiKey(db, { project: projectId, keyId: first!.key.id }, at(30));

      const listed = await apiKeysForProject(db, projectId);
      expect(listed).toHaveLength(3);
      expect(listed.filter((row) => row.revokedAt === null).map((row) => row.id)).toEqual([second!.key.id]);
    });
  });
});
