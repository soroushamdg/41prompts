import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  COMPILER_VERSION,
  artifactBytes,
  buildHashOf,
  compile,
  snapshot,
  type BlokKind,
  type PromptBlok,
} from "@41prompts/core";
import {
  DEFAULT_RUN_MODEL,
  HAS_TEST_DATABASE,
  RUN_PARAMS,
  announceDatabaseSkip,
  createDb,
  inputSets,
  liveFor,
  newProjectId,
  newestVersion,
  projects,
  promptVariables,
  promptVersions,
  prompts,
  publishedArtifacts,
  publishHistory,
  suiteChecks,
  suiteResults,
  suiteRuns,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { previewPublish, publishVersion, readArtifact, undoPublish } from "./publish";
import { buildKey, databaseStore, deployEnv, markerKey } from "./store";

const OWNER = "publish-test-owner";
const STRANGER = "publish-test-stranger";

announceDatabaseSkip("the publish suite");

/**
 * The publish flow, end to end against a real database and the database artifact store (EPIC-051).
 *
 * `storeFor()` picks the database driver whenever the `R2_*` values are absent, and they are absent
 * here — so these tests exercise the same code path `next start` does locally and the drive does by
 * hand. The R2 driver has its own suite, against a fake S3 endpoint.
 */

/**
 * A blok as these fixtures carry it.
 *
 * Declared rather than inferred: `typeof CONTEXT` pins `kind` to the literal `"context"`, so the
 * three constants below would be three incompatible types and no helper could take all of them.
 */
interface Fixture {
  id: string;
  kind: BlokKind;
  text: string;
}

const CONTEXT: Fixture = { id: "b1", kind: "context", text: "You triage inbound support email." };
const CONSTRAINT: Fixture = { id: "b2", kind: "constraint", text: "Reply in at most 80 words." };
const EXPECTED: Fixture = { id: "b3", kind: "expected", text: "Respond with valid JSON." };

function frozen(bloks: readonly Fixture[]) {
  const promptBloks: PromptBlok[] = bloks.map((blok, order) => ({ ...blok, order }));
  return snapshot(promptBloks);
}

describe.skipIf(!HAS_TEST_DATABASE)("publish", () => {
  let db: Db;
  let promptId: string;
  let projectId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
    await db.delete(users).where(eq(users.id, STRANGER));
    await db.delete(publishedArtifacts).where(eq(publishedArtifacts.key, markerKey("")));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "publish-owner@example.test" });
    await db.insert(users).values({ id: STRANGER, name: STRANGER, email: "publish-stranger@example.test" });
    projectId = newProjectId();
    await db.insert(projects).values({ id: projectId, owner: OWNER, name: "P", slug: `p-${projectId}` });
    const [row] = await db.insert(prompts).values({ project: projectId, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;
  });

  afterAll(clear);

  /** Write a version the way `recordVersionNow` would, without going through a server action. */
  async function version(bloks: readonly Fixture[], n = 1): Promise<string> {
    const { bloks: frozenBloks, compiledText } = frozen(bloks);
    const [row] = await db
      .insert(promptVersions)
      .values({
        prompt: promptId,
        n,
        snapshot: frozenBloks,
        compiledText,
        compiledHash: "x".repeat(64),
        snapshotHash: `${n}`.repeat(8),
      })
      .returning({ id: promptVersions.id });
    return row!.id;
  }

  /** A finished suite run over this version, with one result per check at the outcome given. */
  async function runOver(versionId: string, bloks: readonly Fixture[], outcome: "pass" | "fail" | "not_graded") {
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

    const compiled = compile(bloks.map((blok, order) => ({ ...blok, order })));
    for (const [position, check] of compiled.checks.entries()) {
      const [suiteCheck] = await db
        .insert(suiteChecks)
        .values({
          suiteRun: run!.id,
          checkId: check.id,
          blokId: check.blokId,
          blokKind: "expected",
          blokText: check.text,
          position,
        })
        .returning({ id: suiteChecks.id });
      await db
        .insert(suiteResults)
        .values({ suiteRun: run!.id, suiteCheck: suiteCheck!.id, inputIndex: 0, outcome });
    }
    return run!.id;
  }

  const publish = (over: Partial<Parameters<typeof publishVersion>[0]> = {}) =>
    publishVersion({ db, promptId, owner: OWNER, targetModel: DEFAULT_RUN_MODEL, ...over });

  const preview = (over: Partial<Parameters<typeof previewPublish>[0]> = {}) =>
    previewPublish({ db, promptId, owner: OWNER, targetModel: DEFAULT_RUN_MODEL, ...over });

  // ── EPIC-055 C6: the page and the endpoint are two callers of one evaluation ────────────────────

  describe("the preview the Deploy page renders", () => {
    it("agrees with the refusal the endpoint gives, row by row, on a blocked version", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "fail");

      const shown = await preview();
      const attempted = await publish();

      expect(shown.ok).toBe(true);
      expect(attempted.ok).toBe(false);
      if (!shown.ok || attempted.ok || attempted.refusal.kind !== "blocked") return;

      // Field by field, not "both are truthy". Two gates that both say `blocked` while disagreeing
      // about which row blocked is exactly the drift this split exists to make impossible.
      expect(shown.value.report.blocked).toBe(true);
      expect(shown.value.report.rows.map((row) => [row.kind, row.verdict, row.reason, row.blocking])).toEqual(
        attempted.refusal.report.rows.map((row) => [row.kind, row.verdict, row.reason, row.blocking]),
      );
      expect(shown.value.report).toEqual(attempted.refusal.report);
    });

    it("agrees on a version that is not blocked, so the agreement is not a property of refusals", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "pass");

      const shown = await preview();
      const attempted = await publish();
      expect(shown.ok && attempted.ok).toBe(true);
      if (!shown.ok || !attempted.ok) return;

      expect(shown.value.report.blocked).toBe(false);
      expect(shown.value.report).toEqual(attempted.value.report);
      // And the artifact the page described is the one that was published.
      expect(shown.value.artifact.buildHash).toBe(attempted.value.artifact.buildHash);
    });

    it("writes nothing — that is the whole point of it", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "pass");

      const before = (await newestVersion(db, promptId))!;
      expect((await preview()).ok).toBe(true);

      expect(await liveFor(db, promptId)).toBeUndefined();
      expect(await publishHistory(db, promptId)).toHaveLength(0);
      expect(await databaseStore.get(markerKey(promptId))).toBeUndefined();
      // It does not pin the open draft either: looking at Deploy must not close somebody's draft.
      expect((await newestVersion(db, promptId))!.pinnedAt).toBe(before.pinnedAt);

      // The control: publishing the same version *does* write, so the four assertions above can fail.
      expect((await publish()).ok).toBe(true);
      expect(await liveFor(db, promptId)).toBeDefined();
      expect((await newestVersion(db, promptId))!.pinnedAt).not.toBe(null);
    });

    it("reports what is Live, so the page can show Live beside Draft", async () => {
      await version([CONTEXT, CONSTRAINT]);
      expect((await publish()).ok).toBe(true);
      const live = await liveFor(db, promptId);

      await version([CONTEXT, CONSTRAINT, { id: "b9", kind: "context", text: "Prefer plain words." }], 2);
      const shown = await preview();
      expect(shown.ok).toBe(true);
      if (!shown.ok) return;

      expect(shown.value.live?.buildHash).toBe(live?.buildHash);
      expect(shown.value.liveArtifact?.buildHash).toBe(live?.buildHash);
      expect(shown.value.liveVersion?.id).toBeDefined();
      // The Draft it is describing is the newest version, not the Live one.
      expect(shown.value.version.id).toBe((await newestVersion(db, promptId))!.id);
      expect(shown.value.version.id).not.toBe(shown.value.liveVersion?.id);
    });

    it("says nothing is Live before anything has been", async () => {
      await version([CONTEXT, CONSTRAINT]);
      const shown = await preview();
      expect(shown.ok).toBe(true);
      if (!shown.ok) return;
      expect(shown.value.live).toBe(null);
      expect(shown.value.liveArtifact).toBe(null);
      expect(shown.value.liveVersion).toBe(null);
    });

    it("refuses a prompt that is not the caller's, with the same code the endpoint uses", async () => {
      await version([CONTEXT, CONSTRAINT]);
      const shown = await preview({ owner: STRANGER });
      const attempted = await publish({ owner: STRANGER });
      expect(shown.ok).toBe(false);
      expect(attempted.ok).toBe(false);
      if (shown.ok || attempted.ok) return;
      expect(shown.refusal.kind).toBe("no_such_prompt");
      expect(shown.refusal.kind).toBe(attempted.refusal.kind);
    });
  });

  // ── C4: a passing publish writes the artifact and moves Live ───────────────────────────────────

  describe("a version with nothing to prove", () => {
    it("publishes, stores exactly artifactBytes(), and moves Live to it", async () => {
      await version([CONTEXT, CONSTRAINT]);
      const outcome = await publish();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const { artifact } = outcome.value;
      const stored = await databaseStore.get(buildKey(artifact.buildHash));
      // Byte-for-byte what core produces. A second serialiser anywhere here is the copy ADR-005
      // warns about, whose failure mode is that verification quietly always passes.
      expect(stored?.body).toBe(artifactBytes(artifact));
      expect(stored?.cacheControl).toBe("public, max-age=31536000, immutable");

      const live = await liveFor(db, promptId);
      expect(live?.buildHash).toBe(artifact.buildHash);
      expect(live?.kind).toBe("published");
      expect(live?.reason).toBeNull();
      expect(live?.actor).toBe(OWNER);

      const marker = await databaseStore.get(markerKey(promptId));
      expect(marker?.cacheControl).toBe("public, max-age=30");
      expect(JSON.parse(marker?.body ?? "{}")).toMatchObject({
        promptId,
        buildHash: artifact.buildHash,
        version: 1,
        schemaVersion: 1,
      });
    });

    it("names no check suite, because there is nothing to prove", async () => {
      await version([CONTEXT]);
      const outcome = await publish();
      expect(outcome.ok && outcome.value.artifact.checkSuiteId).toBeNull();
      expect(outcome.ok && outcome.value.report.rows[0]?.reason).toBe("nothing_to_prove");
    });

    it("stores the environment-prefixed key, so staging cannot write over production", async () => {
      await version([CONTEXT]);
      const outcome = await publish();
      expect(outcome.ok && buildKey(outcome.value.artifact.buildHash)).toBe(
        `${deployEnv()}/builds/${outcome.ok ? outcome.value.artifact.buildHash : ""}.json`,
      );
    });
  });

  // ── C14: the stored bytes re-derive their own address ──────────────────────────────────────────

  describe("what was stored is what was named", () => {
    it("round-trips through buildHashOf and not through a second serialiser", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "pass");

      const outcome = await publish();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const read = await readArtifact(databaseStore, outcome.value.artifact.buildHash);
      expect(read).not.toBeNull();
      expect(buildHashOf(read!)).toBe(outcome.value.artifact.buildHash);

      // The positive control: the verifier must be able to *fail*. A tampered document read back
      // under the same key is refused rather than used.
      const key = buildKey(outcome.value.artifact.buildHash);
      const tampered = { ...read!, text: `${read!.text} and one more thing` };
      await databaseStore.put(
        { key: `${key}.tampered`, body: JSON.stringify(tampered), contentType: "application/json", cacheControl: "" },
        { immutable: false },
      );
      expect(buildHashOf(tampered)).not.toBe(outcome.value.artifact.buildHash);
    });
  });

  // ── C5: a blocked publish writes nothing ───────────────────────────────────────────────────────

  describe("a version whose checks have not passed", () => {
    it("is stopped, with every gate reason, and writes nothing at all", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "fail");

      const outcome = await publish();
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.kind).toBe("blocked");
      if (outcome.refusal.kind !== "blocked") return;
      expect(outcome.refusal.report.rows.map((row) => row.reason)).toEqual([
        "checks_failed",
        "no_live_callers",
        "cost_unknown",
        "no_live_to_compare",
      ]);

      // Nothing was written. The control below proves this search can see a write when there is one.
      expect(await liveFor(db, promptId)).toBeUndefined();
      expect(await databaseStore.get(markerKey(promptId))).toBeUndefined();
      expect(await publishHistory(db, promptId)).toHaveLength(0);
    });

    it("and the same prompt, once its checks pass, does write — so the check above can fail", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "pass");

      expect((await publish()).ok).toBe(true);
      expect(await liveFor(db, promptId)).toBeDefined();
      expect(await databaseStore.get(markerKey(promptId))).toBeDefined();
    });

    it("is stopped when the checks were never run on this model", async () => {
      await version([CONTEXT, EXPECTED]);
      const outcome = await publish();
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.refusal.kind !== "blocked") return;
      expect(outcome.refusal.report.rows[0]?.reason).toBe("not_proved_on_target_model");
    });

    it("is stopped when a run finished and nothing could be graded", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "not_graded");

      const outcome = await publish();
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.refusal.kind !== "blocked") return;
      expect(outcome.refusal.report.rows[0]?.reason).toBe("nothing_could_be_graded");
    });
  });

  // ── C6: Publish anyway ─────────────────────────────────────────────────────────────────────────

  describe("Publish anyway", () => {
    async function blocked() {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "fail");
    }

    it("goes past a stopped gate with a reason, and records what it went past", async () => {
      await blocked();
      const outcome = await publish({ anywayReason: "hotfix, chargeback wording wrong in prod" });
      expect(outcome.ok).toBe(true);

      const live = await liveFor(db, promptId);
      expect(live?.kind).toBe("published_anyway");
      expect(live?.reason).toBe("hotfix, chargeback wording wrong in prod");
      expect(live?.actor).toBe(OWNER);
      // The gate it went past, in full — not a boolean, and not re-derivable later.
      expect(live?.gate).toMatchObject({ blocked: true });
    });

    it("refuses a reason under ten characters", async () => {
      await blocked();
      const outcome = await publish({ anywayReason: "hotfix" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal).toEqual({ kind: "reason_too_short", minimum: 10 });
      expect(await liveFor(db, promptId)).toBeUndefined();
    });

    it("refuses a reason that is only whitespace, however long", async () => {
      await blocked();
      const outcome = await publish({ anywayReason: "               " });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal).toEqual({ kind: "reason_too_short", minimum: 10 });
    });

    it("records an ordinary publish when the gate was not stopping anything", async () => {
      await version([CONTEXT]);
      const outcome = await publish({ anywayReason: "keeping a note of why" });
      expect(outcome.ok).toBe(true);
      const live = await liveFor(db, promptId);
      // The kind follows the gate, not the presence of a reason: nothing was excepted here.
      expect(live?.kind).toBe("published");
      expect(live?.reason).toBe("keeping a note of why");
    });
  });

  // ── C7: Undo ───────────────────────────────────────────────────────────────────────────────────

  describe("Undo", () => {
    it("moves Live back to the previous artifact and records why", async () => {
      await version([CONTEXT]);
      const first = await publish();
      expect(first.ok).toBe(true);
      if (!first.ok) return;

      await version([CONTEXT, CONSTRAINT], 2);
      const second = await publish();
      expect(second.ok).toBe(true);
      if (!second.ok) return;
      expect(second.value.artifact.buildHash).not.toBe(first.value.artifact.buildHash);

      const undone = await undoPublish({ db, promptId, owner: OWNER, reason: "latency spike on Gemini" });
      expect(undone.ok).toBe(true);

      const live = await liveFor(db, promptId);
      expect(live?.buildHash).toBe(first.value.artifact.buildHash);
      expect(live?.kind).toBe("undone");
      expect(live?.versionN).toBe(1);

      // The marker follows, or nothing in the field would learn about the undo.
      expect(JSON.parse((await databaseStore.get(markerKey(promptId)))?.body ?? "{}")).toMatchObject({
        buildHash: first.value.artifact.buildHash,
        version: 1,
      });
      expect(await publishHistory(db, promptId)).toHaveLength(3);
    });

    it("refuses when there is nothing to go back to", async () => {
      await version([CONTEXT]);
      await publish();
      const outcome = await undoPublish({ db, promptId, owner: OWNER, reason: "no earlier version exists" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.kind).toBe("nothing_to_undo");
    });

    it("requires a reason of its own", async () => {
      await version([CONTEXT]);
      await publish();
      await version([CONTEXT, CONSTRAINT], 2);
      await publish();

      const outcome = await undoPublish({ db, promptId, owner: OWNER, reason: "oops" });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal).toEqual({ kind: "reason_too_short", minimum: 10 });
      // Nothing moved.
      expect((await liveFor(db, promptId))?.kind).toBe("published");
    });
  });

  // ── Found by the drive: a published version must stop changing ─────────────────────────────────

  describe("publishing pins the version it published", () => {
    /**
     * **The drive found this**, 2026-09-17: after two publishes the Versions page still showed one
     * `Draft v1`, because `prompt_versions` rule 2 rewrites the open draft in place while `pinnedAt`
     * is null. So the second publish's blok set had replaced the first's *inside the row the first
     * publish event names* — the log said a version was published whose snapshot was no longer what
     * was published. The artifacts themselves were fine; the ability to explain them was not.
     */
    it("stamps pinnedAt, so the next edit mints a new version instead of rewriting this one", async () => {
      await version([CONTEXT]);
      expect((await newestVersion(db, promptId))!.pinnedAt).toBeNull();

      expect((await publish()).ok).toBe(true);
      const after = await newestVersion(db, promptId);
      expect(after?.pinnedAt).not.toBeNull();
      expect(after?.n).toBe(1);
    });

    it("does not close the open draft when the publish was refused", async () => {
      await version([CONTEXT, EXPECTED]);
      const versionId = (await newestVersion(db, promptId))!.id;
      await runOver(versionId, [CONTEXT, EXPECTED], "fail");

      expect((await publish()).ok).toBe(false);
      // Nothing points at it, so nothing may freeze it. A gate that closes a draft on refusal would
      // cost a version for every attempt somebody makes to get their checks green.
      expect((await newestVersion(db, promptId))!.pinnedAt).toBeNull();
    });

    it("leaves an already pinned version alone", async () => {
      await version([CONTEXT]);
      await publish();
      const first = await newestVersion(db, promptId);

      // A second publish of the same, already pinned version must not restamp it: `pinnedAt` is
      // when the row stopped changing, not when it was last looked at.
      await publish();
      expect((await newestVersion(db, promptId))!.pinnedAt?.getTime()).toBe(first!.pinnedAt?.getTime());
    });
  });

  // ── C8's other half: the contract row, against the callers already in the field ────────────────

  describe("a change that would break the apps already calling this prompt", () => {
    it("is stopped, and says which variable", async () => {
      await db.insert(promptVariables).values({ prompt: promptId, name: "email", defaultValue: null, description: null });
      await version([CONTEXT]);
      const first = await publish();
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      expect(first.value.artifact.variables.map((each) => each.name)).toEqual(["email"]);

      // A second required variable. Every caller written against Live omits it, so publishing this
      // ships a prompt with an unfilled placeholder to production traffic, with no error anywhere.
      await db.insert(promptVariables).values({ prompt: promptId, name: "locale", defaultValue: null, description: null });
      await version([CONTEXT, CONSTRAINT], 2);

      const outcome = await publish();
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.refusal.kind !== "blocked") return;

      const contract = outcome.refusal.report.rows.find((row) => row.kind === "contract");
      expect(contract?.reason).toBe("contract_broken");
      expect(contract?.detail).toEqual({ of: "contract", breaks: [{ kind: "added_required", name: "locale" }] });
      // Live did not move.
      expect((await liveFor(db, promptId))?.buildHash).toBe(first.value.artifact.buildHash);
    });

    it("allows the same change when the new variable has a default", async () => {
      await db.insert(promptVariables).values({ prompt: promptId, name: "email", defaultValue: null, description: null });
      await version([CONTEXT]);
      expect((await publish()).ok).toBe(true);

      // Optional, so a caller that never sends it keeps working. Not a break.
      await db.insert(promptVariables).values({ prompt: promptId, name: "locale", defaultValue: "en", description: null });
      await version([CONTEXT, CONSTRAINT], 2);

      const outcome = await publish();
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value.report.rows.find((row) => row.kind === "contract")?.reason).toBe("contract_compatible");
    });
  });

  // ── C13: a version the current compiler no longer reproduces ───────────────────────────────────

  describe("a version whose compiled text no longer matches its snapshot", () => {
    it("is refused, rather than publishing text nobody proved", async () => {
      const { bloks: frozenBloks } = frozen([CONTEXT, CONSTRAINT]);
      await db.insert(promptVersions).values({
        prompt: promptId,
        n: 1,
        snapshot: frozenBloks,
        // What an earlier compiler produced. A fresh compile gives something else.
        compiledText: "You triage inbound support email.@@Reply in at most 80 words.",
        compiledHash: "x".repeat(64),
        snapshotHash: "1".repeat(8),
      });

      const outcome = await publish();
      expect(outcome.ok).toBe(false);
      if (outcome.ok || outcome.refusal.kind !== "build") return;
      expect(outcome.refusal.refusal).toMatchObject({ kind: "compiler_moved", compilerVersion: COMPILER_VERSION });
      expect(await liveFor(db, promptId)).toBeUndefined();
    });
  });

  // ── Ownership and the admin-only switch ────────────────────────────────────────────────────────

  describe("who may publish", () => {
    it("refuses another person's prompt without confirming it exists", async () => {
      await version([CONTEXT]);
      const outcome = await publishVersion({
        db,
        promptId,
        owner: STRANGER,
        targetModel: DEFAULT_RUN_MODEL,
      });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      // The same refusal a missing prompt gives, deliberately: the two must not be tellable apart.
      expect(outcome.refusal.kind).toBe("no_such_prompt");
    });

    it("refuses a version that belongs to another prompt", async () => {
      await version([CONTEXT]);
      const [other] = await db.insert(prompts).values({ project: projectId, name: "Other" }).returning({ id: prompts.id });
      const [otherVersion] = await db
        .insert(promptVersions)
        .values({
          prompt: other!.id,
          n: 1,
          snapshot: frozen([CONTEXT]).bloks,
          compiledText: frozen([CONTEXT]).compiledText,
          compiledHash: "z".repeat(64),
        })
        .returning({ id: promptVersions.id });

      const outcome = await publish({ versionId: otherVersion!.id });
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.refusal.kind).toBe("no_such_version");
    });

    /**
     * `admin_only_publish` defaults on and there is no team model, so the owner is the only member
     * and is the admin — this cannot refuse anybody yet. What the test proves is that the check
     * **runs**: the switch is read, and a project whose owner does not match is refused by it rather
     * than by the ownership resolution above.
     */
    it("runs the admin-only check, and the switch is on by default", async () => {
      const { publishSettingsFor, mayPublish } = await import("./settings");
      expect(await publishSettingsFor(db, projectId)).toEqual({ owner: OWNER, adminOnlyPublish: true });
      expect(await mayPublish(db, projectId, OWNER)).toBe(true);
      expect(await mayPublish(db, projectId, STRANGER)).toBe(false);

      // With the switch off, anybody who reached the project may publish. Nothing sets it today;
      // the assertion is that the column is what decides, rather than a constant.
      await db.update(projects).set({ adminOnlyPublish: false }).where(eq(projects.id, projectId));
      expect(await mayPublish(db, projectId, STRANGER)).toBe(true);
    });
  });
});
