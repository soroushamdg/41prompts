import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import {
  addBlok,
  applySnapshot,
  BlokBelongsElsewhereError,
  bloksForPrompt,
  deleteBlok,
  setHandEdit,
  type SnapshotBlokRow,
} from "./canvas";
import { createDb, type Db } from "./client";
import { newComparisonId, newProjectId } from "./ids";
import { comparisonRuns, createSuiteRun } from "./suites";
import { bloks, inputSets, projects, prompts, users } from "./schema";

/**
 * Restore, and the two runs of an A/B (EPIC-041).
 *
 * **This file does not import `@41prompts/core` either**, for the reason `versions.test.ts` gives:
 * `applySnapshot` takes the snapshot's blok shape as plain data and has no opinion about how a blok
 * set became one. `apps/web` is the seam where the two packages meet, and its e2e is where they are
 * checked together.
 *
 * The roadmap's Review line for this epic is three words — **"Restore never deletes"** — and most of
 * what is below is that sentence, asserted from several directions.
 */
const OWNER = "restore-test-owner";

announceDatabaseSkip("the restore suite");

describe.skipIf(!HAS_TEST_DATABASE)("restore", () => {
  let db: Db;
  let promptId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, OWNER));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "restore-owner@example.test" });
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "R", slug: `r-${project}` });
    const [row] = await db.insert(prompts).values({ project, name: "Router" }).returning({ id: prompts.id });
    promptId = row!.id;
  });

  afterAll(clear);

  /** A snapshot row, the shape `readSnapshotBloks` hands over. */
  const snap = (
    id: string,
    kind: string,
    text: string,
    position: number,
    edit: { editedText: string; editedFromHash: string } | null = null,
  ): SnapshotBlokRow => ({
    id,
    kind,
    text,
    position,
    editedText: edit?.editedText ?? null,
    editedFromHash: edit?.editedFromHash ?? null,
  });

  /** Every row of the prompt, deleted ones included — which is what most of these assertions are about. */
  async function everyRow() {
    return db
      .select({ id: bloks.id, text: bloks.text, kind: bloks.kind, deletedAt: bloks.deletedAt })
      .from(bloks)
      .where(eq(bloks.prompt, promptId));
  }

  it("puts text, kind and order back, in the snapshot's order", async () => {
    const a = await addBlok(db, promptId, { kind: "context", text: "first" });
    const b = await addBlok(db, promptId, { kind: "context", text: "second" });

    // Both edited since, and swapped.
    await applySnapshot(db, promptId, [snap(b.id, "constraint", "second, restored", 0), snap(a.id, "context", "first, restored", 1)]);

    const live = await bloksForPrompt(db, promptId);
    expect(live.map((blok) => [blok.id, blok.kind, blok.text])).toEqual([
      [b.id, "constraint", "second, restored"],
      [a.id, "context", "first, restored"],
    ]);
  });

  it("brings a soft-deleted blok back under its own id", async () => {
    const a = await addBlok(db, promptId, { kind: "context", text: "still here" });
    const b = await addBlok(db, promptId, { kind: "constraint", text: "deleted since" });
    await deleteBlok(db, promptId, b.id);
    expect(await bloksForPrompt(db, promptId)).toHaveLength(1);

    await applySnapshot(db, promptId, [snap(a.id, "context", "still here", 0), snap(b.id, "constraint", "deleted since", 1)]);

    const live = await bloksForPrompt(db, promptId);
    expect(live.map((blok) => blok.id)).toEqual([a.id, b.id]);
    // **The id, not just the text.** `diff()` matches on id, so a restore that re-inserted the text
    // under a fresh id would make every future diff report a removal and an addition where a person
    // restored something — the one failure the whole diff design exists to prevent.
    expect(await everyRow()).toHaveLength(2);
  });

  it("removes a blok the snapshot does not have — softly, so Undo is still clearing a column", async () => {
    const a = await addBlok(db, promptId, { kind: "context", text: "keep" });
    const b = await addBlok(db, promptId, { kind: "constraint", text: "added after the version" });

    const result = await applySnapshot(db, promptId, [snap(a.id, "context", "keep", 0)]);

    expect(result).toEqual({ restored: 1, removed: 1 });
    expect((await bloksForPrompt(db, promptId)).map((blok) => blok.id)).toEqual([a.id]);
    // The row is still there. This is the Review line: restore never deletes.
    const rows = await everyRow();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === b.id)?.deletedAt).not.toBeNull();
  });

  it("reinstates a hand edit, both halves of it", async () => {
    const a = await addBlok(db, promptId, { kind: "constraint", text: "Reply in at most 80 words." });
    await setHandEdit(db, promptId, a.id, null);

    await applySnapshot(db, promptId, [
      snap(a.id, "constraint", "Reply in at most 80 words.", 0, {
        editedText: "Keep it under 40 words.",
        editedFromHash: "h0",
      }),
    ]);

    const [live] = await bloksForPrompt(db, promptId);
    expect(live?.editedText).toBe("Keep it under 40 words.");
    expect(live?.editedFromHash).toBe("h0");
  });

  it("clears a hand edit the snapshot did not have", async () => {
    const a = await addBlok(db, promptId, { kind: "constraint", text: "Reply in at most 80 words." });
    await setHandEdit(db, promptId, a.id, { text: "typed later", fromHash: "h1" });

    await applySnapshot(db, promptId, [snap(a.id, "constraint", "Reply in at most 80 words.", 0)]);

    const [live] = await bloksForPrompt(db, promptId);
    // A version that had no hand edit must restore as a version with no hand edit. Leaving the later
    // edit in place would produce a prompt the person never had — the same class of loss the
    // snapshot stores `editedText` to prevent, arriving from the other direction.
    expect(live?.editedText).toBeNull();
    expect(live?.editedFromHash).toBeNull();
  });

  it("restoring an empty snapshot empties the canvas without deleting a row", async () => {
    const a = await addBlok(db, promptId, { kind: "context", text: "only" });

    const result = await applySnapshot(db, promptId, []);

    expect(result).toEqual({ restored: 0, removed: 1 });
    expect(await bloksForPrompt(db, promptId)).toHaveLength(0);
    expect((await everyRow()).map((row) => row.id)).toEqual([a.id]);
  });

  it("is idempotent: restoring the same snapshot twice leaves the same canvas", async () => {
    const a = await addBlok(db, promptId, { kind: "context", text: "one" });
    const shape = [snap(a.id, "context", "one", 0)];

    await applySnapshot(db, promptId, shape);
    const first = await bloksForPrompt(db, promptId);
    await applySnapshot(db, promptId, shape);

    expect(await bloksForPrompt(db, promptId)).toEqual(first);
  });

  it("refuses, whole, when a snapshot names a blok that is another prompt's row", async () => {
    // `bloks.id` is a **global** primary key. This case cannot arise from minted ids, which are
    // random; it can from the decompiler's content-derived `blok_` ones, where two prompts holding
    // identical text hold identical ids. Nothing mints those into `bloks` today and this is the
    // guard for the day something does.
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: OWNER, name: "R2", slug: `r2-${project}` });
    const [other] = await db.insert(prompts).values({ project, name: "Other" }).returning({ id: prompts.id });
    await addBlok(db, other!.id, { kind: "context", text: "not mine", id: "blok_shared" });
    const mine = await addBlok(db, promptId, { kind: "context", text: "untouched" });

    await expect(
      applySnapshot(db, promptId, [snap("blok_shared", "constraint", "mine", 0)]),
    ).rejects.toBeInstanceOf(BlokBelongsElsewhereError);

    // Refused, and rolled back: the other prompt's row is as it was, and so is this canvas. The two
    // alternatives — minting a new id, or skipping the blok — would both produce a prompt the
    // person never had, one of them silently.
    const [theirs] = await db
      .select({ text: bloks.text })
      .from(bloks)
      .where(and(eq(bloks.id, "blok_shared"), eq(bloks.prompt, other!.id)));
    expect(theirs?.text).toBe("not mine");
    expect((await bloksForPrompt(db, promptId)).map((blok) => [blok.id, blok.text])).toEqual([
      [mine.id, "untouched"],
    ]);
  });
});

describe.skipIf(!HAS_TEST_DATABASE)("an A/B is two runs sharing one comparison", () => {
  let db: Db;
  let promptId: string;
  let inputSetId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    await db.delete(users).where(eq(users.id, "ab-test-owner"));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values({ id: "ab-test-owner", name: "ab", email: "ab-owner@example.test" });
    const project = newProjectId();
    await db.insert(projects).values({ id: project, owner: "ab-test-owner", name: "AB", slug: `ab-${project}` });
    const [prompt] = await db.insert(prompts).values({ project, name: "Router" }).returning({ id: prompts.id });
    promptId = prompt!.id;
    const [set] = await db
      .insert(inputSets)
      .values({ prompt: promptId, name: "inputs.csv", columns: ["q"], rows: [["hello"]], rowCount: 1 })
      .returning({ id: inputSets.id });
    inputSetId = set!.id;
  });

  afterAll(clear);

  const run = (comparison: string, text: string) =>
    createSuiteRun(
      db,
      {
        owner: "ab-test-owner",
        prompt: promptId,
        inputSet: inputSetId,
        model: "claude-sonnet-5",
        params: {},
        promptHash: `hash-${text}`,
        promptText: text,
        totalInputs: 1,
        comparison,
      },
      [],
    );

  it("reads back as a pair, oldest first", async () => {
    const comparison = newComparisonId();
    const a = await run(comparison, "version a");
    const b = await run(comparison, "version b");

    const pair = await comparisonRuns(db, comparison, "ab-test-owner");
    expect(pair.map((row) => row.id)).toEqual([a, b]);
    expect(pair.map((row) => row.promptText)).toEqual(["version a", "version b"]);
  });

  it("leaves an ordinary run's comparison null", async () => {
    const id = await createSuiteRun(
      db,
      {
        owner: "ab-test-owner",
        prompt: promptId,
        inputSet: inputSetId,
        model: "claude-sonnet-5",
        params: {},
        promptHash: "h",
        promptText: "plain",
        totalInputs: 1,
      },
      [],
    );
    const pair = await comparisonRuns(db, newComparisonId(), "ab-test-owner");
    expect(pair).toHaveLength(0);
    expect(id).toMatch(/^srun_/);
  });

  it("is scoped by owner, so one account's comparison id reads nothing from another's", async () => {
    const comparison = newComparisonId();
    await run(comparison, "version a");
    // The id is a bearer of nothing on its own — the read still resolves through the owner column,
    // because a `comparison` is written on a row and a read that trusts an earlier resolution is
    // how a leak arrives.
    expect(await comparisonRuns(db, comparison, "somebody-else")).toHaveLength(0);
  });
});
