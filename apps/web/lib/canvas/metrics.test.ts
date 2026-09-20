import {
  DEFAULT_RUN_MODEL,
  HAS_TEST_DATABASE,
  RUN_PARAMS,
  addInputSet,
  announceDatabaseSkip,
  createDb,
  newProjectId,
  projects,
  prompts,
  suiteChecks,
  suiteResults,
  suiteRuns,
  testDatabaseUrl,
  users,
  type Db
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { metricsForProjects } from "./metrics";

const OWNER = "project-metrics-owner";
const OTHER = "project-metrics-stranger";

announceDatabaseSkip("the project metrics suite");

/**
 * The three numbers on a project card.
 *
 * **A database test, not a unit test with a stub.** What is being asserted is a relationship across
 * four tables — a run belongs to a prompt belongs to a project, and its results belong to the run —
 * and a stub would assert only that this file agrees with itself. `input-sets.test.ts` makes the
 * same choice for the same reason.
 */
describe.skipIf(!HAS_TEST_DATABASE)("metricsForProjects", () => {
  let db: Db;
  let projectId: string;
  let promptId: string;
  /** `suite_runs.input_set` is NOT NULL: a run is always a run *over* something. */
  let inputSetId: string;

  beforeAll(() => {
    db = createDb(testDatabaseUrl());
  });

  async function clear(): Promise<void> {
    for (const id of [OWNER, OTHER]) await db.delete(users).where(eq(users.id, id));
  }

  beforeEach(async () => {
    await clear();
    await db.insert(users).values([
      { id: OWNER, name: OWNER, email: "metrics-owner@example.test" },
      { id: OTHER, name: OTHER, email: "metrics-stranger@example.test" }
    ]);
    projectId = newProjectId();
    await db
      .insert(projects)
      .values({ id: projectId, owner: OWNER, name: "Refunds", slug: `p-${projectId}` });
    const [row] = await db
      .insert(prompts)
      .values({ project: projectId, name: "Classifier" })
      .returning({ id: prompts.id });
    promptId = row!.id;
    inputSetId = (
      await addInputSet(db, promptId, { name: "Inputs", columns: ["input"], rows: [["a"]] })
    ).id;
  });

  afterAll(clear);

  /** A run, written the way the worker leaves one. `outcomes` are its graded results. */
  async function runWith(
    state: "done" | "running",
    cents: { model: number; judge: number },
    outcomes: readonly string[] = []
  ): Promise<string> {
    const [run] = await db
      .insert(suiteRuns)
      .values({
        owner: OWNER,
        prompt: promptId,
        inputSet: inputSetId,
        model: DEFAULT_RUN_MODEL,
        params: RUN_PARAMS,
        promptHash: "a".repeat(64),
        promptText: "whatever the prompt said",
        state,
        totalInputs: outcomes.length,
        completedInputs: outcomes.length,
        costCents: cents.model,
        judgeCostCents: cents.judge
      })
      .returning({ id: suiteRuns.id });

    // A result points at a `suite_checks` row, which is the run's frozen copy of the check — so a
    // fixture has to write one before it can write a result against it.
    for (const [index, outcome] of outcomes.entries()) {
      const [check] = await db
        .insert(suiteChecks)
        .values({
          suiteRun: run!.id,
          checkId: `chk_${index}`,
          blokId: "blk_1",
          blokKind: "expected",
          blokText: "Output must be valid JSON.",
          kind: "json_shape",
          position: index
        })
        .returning({ id: suiteChecks.id });

      await db.insert(suiteResults).values({
        suiteRun: run!.id,
        suiteCheck: check!.id,
        inputIndex: index,
        outcome
      });
    }
    return run!.id;
  }

  it("reports nothing at all for a project that has never been run", async () => {
    const metrics = await metricsForProjects(db, OWNER, [projectId]);
    // Absent, not zero. A card printing `0%` and `$0.00` says the project was run and did badly.
    expect(metrics.get(projectId)).toBeUndefined();
  });

  it("counts runs and sums model and judge spend together", async () => {
    await runWith("done", { model: 12, judge: 3 }, ["pass"]);
    await runWith("done", { model: 20, judge: 0 }, ["pass"]);

    const metrics = await metricsForProjects(db, OWNER, [projectId]);
    expect(metrics.get(projectId)?.runs).toBe(2);
    expect(metrics.get(projectId)?.costCents).toBe(35);
  });

  it("takes the pass rate from the newest finished run, not an average of all of them", async () => {
    await runWith("done", { model: 1, judge: 0 }, ["fail", "fail", "fail", "fail"]);
    await runWith("done", { model: 1, judge: 0 }, ["pass", "pass", "pass", "fail"]);

    // 0.75, not 0.375. "How did the last thing you ran do" is the question a card answers.
    expect((await metricsForProjects(db, OWNER, [projectId])).get(projectId)?.passRate).toBeCloseTo(
      0.75,
      5
    );
  });

  it("ignores a run that has not finished when rating, but still counts and costs it", async () => {
    await runWith("done", { model: 5, judge: 0 }, ["pass", "pass"]);
    await runWith("running", { model: 7, judge: 0 }, []);

    const metrics = await metricsForProjects(db, OWNER, [projectId]);
    expect(metrics.get(projectId)?.runs).toBe(2);
    expect(metrics.get(projectId)?.costCents).toBe(12);
    // The in-flight run is newer and has no rate. Reporting one mid-flight is how EPIC-042's drive
    // found "nothing graded" rendering as a result.
    expect(metrics.get(projectId)?.passRate).toBeCloseTo(1, 5);
  });

  /**
   * EPIC-030 made `not_graded` a third outcome and refused to fold it into a fail. A run in which
   * nothing could be graded scored **nothing**, which is a different sentence from zero.
   */
  it("says null, not zero, when a finished run graded nothing", async () => {
    await runWith("done", { model: 2, judge: 0 }, ["not_graded", "not_graded"]);

    const metrics = await metricsForProjects(db, OWNER, [projectId]);
    expect(metrics.get(projectId)?.passRate).toBeNull();
    expect(metrics.get(projectId)?.runs).toBe(1);
  });

  it("does not count an ungradable result as a failure", async () => {
    await runWith("done", { model: 1, judge: 0 }, ["pass", "not_graded"]);
    // 1 of 1 graded, not 1 of 2.
    expect((await metricsForProjects(db, OWNER, [projectId])).get(projectId)?.passRate).toBeCloseTo(
      1,
      5
    );
  });

  /**
   * The helper reads somebody's numbers, so it scopes by owner rather than trusting its caller to
   * have checked. A helper that trusts its caller is one refactor away from being called by
   * something that did not.
   */
  it("tells a stranger nothing about a project they do not own", async () => {
    await runWith("done", { model: 9, judge: 0 }, ["pass"]);
    expect((await metricsForProjects(db, OTHER, [projectId])).size).toBe(0);
  });

  it("asks the database nothing when there are no projects", async () => {
    expect(await metricsForProjects(db, OWNER, [])).toEqual(new Map());
  });

  /**
   * **The property that matters is a fixed number of queries, not "one".** A pass rate spans
   * `suite_runs` and `suite_results`, so one is not honestly available — what must never happen is
   * a query per project. Twelve projects cost the same as one.
   */
  it("costs the same number of queries for twelve projects as for one", async () => {
    const ids = [projectId];
    for (let index = 0; index < 11; index += 1) {
      const id = newProjectId();
      await db.insert(projects).values({ id, owner: OWNER, name: `P${index}`, slug: `p-${id}` });
      ids.push(id);
    }
    await runWith("done", { model: 4, judge: 1 }, ["pass"]);

    const counted = (list: readonly string[]) => {
      let queries = 0;
      const spy = new Proxy(db, {
        get(target, property, receiver) {
          if (property === "select" || property === "selectDistinctOn") queries += 1;
          return Reflect.get(target, property, receiver) as unknown;
        }
      }) as Db;
      return metricsForProjects(spy, OWNER, list).then(() => queries);
    };

    expect(await counted(ids)).toBe(await counted([projectId]));
  });
});
