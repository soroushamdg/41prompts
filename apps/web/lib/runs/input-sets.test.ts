import { eq } from "drizzle-orm";
import {
  DEFAULT_RUN_MODEL,
  HAS_TEST_DATABASE,
  RUN_PARAMS,
  addInputSet,
  announceDatabaseSkip,
  createDb,
  inputSetForPrompt,
  newProjectId,
  projects,
  prompts,
  replaceInputSetRows,
  runCountsForInputSets,
  suiteRuns,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { editRefusalFor } from "./queries";

const OWNER = "by-hand-test-owner";

announceDatabaseSkip("the by-hand input-set suite");

/**
 * The rule that keeps a finished run's inputs finished (EPIC-032a decision 3).
 *
 * ## Why this is a database test and not a unit test with a stub
 *
 * The thing being asserted is a relationship between two tables — that a `suite_run` references an
 * `input_set` and does not copy it — and a stub of `runCountsForInputSets` would assert only that
 * this file agrees with itself. `publish.test.ts` makes the same choice for the same reason.
 */
describe.skipIf(!HAS_TEST_DATABASE)("editing an input set", () => {
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
    await db.insert(users).values({ id: OWNER, name: OWNER, email: "by-hand-owner@example.test" });
    const projectId = newProjectId();
    await db.insert(projects).values({ id: projectId, owner: OWNER, name: "P", slug: `p-${projectId}` });
    const [row] = await db.insert(prompts).values({ project: projectId, name: "Scheduler" }).returning({
      id: prompts.id,
    });
    promptId = row!.id;
  });

  afterAll(clear);

  /** A finished run over a set, written the way `createSuiteRun` would leave one. */
  async function runOver(inputSetId: string): Promise<void> {
    await db.insert(suiteRuns).values({
      owner: OWNER,
      prompt: promptId,
      inputSet: inputSetId,
      model: DEFAULT_RUN_MODEL,
      params: RUN_PARAMS,
      promptHash: "a".repeat(64),
      promptText: "whatever the prompt said at the time",
      state: "done",
      totalInputs: 1,
      completedInputs: 1,
    });
  }

  it("counts no runs for a set nothing has run, and leaves it out of the map", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    const counts = await runCountsForInputSets(db, [set.id]);
    // Absent, not zero — every caller reads it with `?? 0` and a dense map would mean asking twice.
    expect(counts.has(set.id)).toBe(false);
    expect(counts.get(set.id) ?? 0).toBe(0);
  });

  it("counts every run against a set", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    await runOver(set.id);
    await runOver(set.id);
    expect((await runCountsForInputSets(db, [set.id])).get(set.id)).toBe(2);
  });

  it("counts several sets in one query and keeps them apart", async () => {
    const one = await addInputSet(db, promptId, { name: "One", columns: ["input"], rows: [["a"]] });
    const two = await addInputSet(db, promptId, { name: "Two", columns: ["input"], rows: [["b"]] });
    await runOver(one.id);

    const counts = await runCountsForInputSets(db, [one.id, two.id]);
    expect(counts.get(one.id)).toBe(1);
    expect(counts.has(two.id)).toBe(false);
  });

  it("asks the database nothing when there are no sets", async () => {
    expect(await runCountsForInputSets(db, [])).toEqual(new Map());
  });

  // ── A4 and A5: the branch, in both directions ──────────────────────────────────────────────

  it("allows an edit when nothing has run the set", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    expect(await editRefusalFor(db, set.id)).toBeUndefined();
  });

  it("refuses an edit once a run has used the set, and names why", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    await runOver(set.id);

    const refusal = await editRefusalFor(db, set.id);
    expect(refusal).toBeDefined();
    expect(refusal).toContain("A run has");
    expect(refusal).toContain("Duplicate the set");
  });

  it("counts runs in the plural when there are several", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    await runOver(set.id);
    await runOver(set.id);
    expect(await editRefusalFor(db, set.id)).toContain("2 runs have");
  });

  // ── A6, at the layer where the defect would live ───────────────────────────────────────────

  it("replaces rows and the row count together", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    await replaceInputSetRows(db, promptId, set.id, { name: "Renamed", rows: [["x"], ["y"]] });

    const after = await inputSetForPrompt(db, promptId, set.id);
    expect(after?.name).toBe("Renamed");
    expect(after?.rows).toEqual([["x"], ["y"]]);
    // The count is stored, not derived at read time, so a write that changed one and not the other
    // would make a listing disagree with the set it is listing.
    expect(after?.rowCount).toBe(2);
  });

  it("does not replace rows belonging to another prompt", async () => {
    const set = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    const projectId = newProjectId();
    await db.insert(projects).values({ id: projectId, owner: OWNER, name: "Other", slug: `o-${projectId}` });
    const [other] = await db.insert(prompts).values({ project: projectId, name: "Other" }).returning({
      id: prompts.id,
    });

    await replaceInputSetRows(db, other!.id, set.id, { name: "Hijacked", rows: [["z"]] });

    const after = await inputSetForPrompt(db, promptId, set.id);
    expect(after?.name).toBe("Inputs 1");
    expect(after?.rows).toEqual([["a"]]);
  });

  it("leaves the original untouched when a copy is edited", async () => {
    // The shape of the duplicate-and-edit path, asserted at the storage layer: two rows, and a
    // write to one that cannot reach the other. The browser-level assertion is in the e2e spec.
    const original = await addInputSet(db, promptId, { name: "Inputs 1", columns: ["input"], rows: [["a"]] });
    await runOver(original.id);

    const before = await inputSetForPrompt(db, promptId, original.id);
    const copy = await addInputSet(db, promptId, {
      name: `${before!.name} (copy)`,
      columns: before!.columns,
      rows: before!.rows,
    });
    await replaceInputSetRows(db, promptId, copy.id, { name: "Edited copy", rows: [["changed"]] });

    const after = await inputSetForPrompt(db, promptId, original.id);
    expect(after?.rows).toEqual([["a"]]);
    expect(after?.name).toBe("Inputs 1");
    expect((await inputSetForPrompt(db, promptId, copy.id))?.rows).toEqual([["changed"]]);
  });
});
