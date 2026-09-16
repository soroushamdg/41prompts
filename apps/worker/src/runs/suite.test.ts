import {
  addInputSet,
  announceDatabaseSkip,
  createDb,
  createSuiteRun,
  declareVariable,
  DEFAULT_RUN_MODEL,
  HAS_TEST_DATABASE,
  projects,
  prompts,
  RUN_PARAMS,
  runBudgets,
  runs,
  suiteChecksFor,
  suiteResultsFor,
  suiteRunById,
  testDatabaseUrl,
  users,
  type Db,
} from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { priceFor, reservationCentsFor } from "./prices";
import { echoLastLineProvider, type SelectProvider } from "./provider";
import { runSuite } from "./suite";

const OWNER = "usr_suite_test";
const PROJECT = "proj_sut0";
const PROMPT = "pr_suite001";

/**
 * The selector the tests hand `runSuite` (EPIC-042).
 *
 * A **function** rather than a value, because that is what the production path is: `runSuite` asks
 * for a provider per model, so the run's model and the judge's get separate answers. Here both get
 * the same fake, which is what they got before.
 */
const FAKE: SelectProvider = async () => ({ provider: echoLastLineProvider(), name: "fake for a test" });

/** No provider at all, for any model. */
const NONE: SelectProvider = async () => undefined;

/**
 * A prompt whose last line is the answer, so the fake's echo is the value the CSV supplied.
 *
 * `Never mention "sorry".` compiles to a `must_not_contain` check with the needle `sorry`;
 * `Reply in at most 30 words.` compiles to a `word_limit` of 30. So a row whose `answer` is
 * "I am sorry, no." fails the first and passes the second, and a row whose answer is "All good." passes
 * both — which is a real mixed result rather than a fixture that always agrees.
 */
const COMPILED = 'Never mention "sorry".\n\nReply in at most 30 words.\n\n{{answer}}';

announceDatabaseSkip("runSuite");

describe.skipIf(!HAS_TEST_DATABASE)("runSuite", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Suite test", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "Suite", slug: `suite-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "Suite" });
    await declareVariable(db, PROMPT, { name: "answer", defaultValue: null, description: null });
  });

  beforeEach(async () => {
    await db.delete(runs).where(eq(runs.owner, OWNER));
    await db.delete(runBudgets).where(eq(runBudgets.owner, OWNER));
    await db.insert(runBudgets).values({ owner: OWNER, capCents: 100_000, spentCents: 0 });
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
  });

  async function trigger(rows: string[][]): Promise<string> {
    const set = await addInputSet(db, PROMPT, { name: "inputs.csv", columns: ["answer"], rows });
    return createSuiteRun(
      db,
      {
        owner: OWNER,
        prompt: PROMPT,
        inputSet: set.id,
        model: DEFAULT_RUN_MODEL,
        params: RUN_PARAMS as Record<string, unknown>,
        promptHash: "hash-for-a-test",
        promptText: COMPILED,
        totalInputs: rows.length,
      },
      [
        {
          checkId: "chk_one",
          blokId: "blok_one",
          blokKind: "expected",
          blokText: 'Never mention "sorry".',
          kind: "must_not_contain",
        },
        {
          checkId: "chk_two",
          blokId: "blok_two",
          blokKind: "expected",
          blokText: "Reply in at most 30 words.",
          kind: "word_limit",
        },
      ],
    );
  }

  it("binds each row, grades every check against that row's output, and finishes", async () => {
    const id = await trigger([["All good."], ["I am sorry, no."]]);
    await runSuite(db, id, FAKE);

    const run = await suiteRunById(db, id);
    expect(run?.state).toBe("done");
    expect(run?.completedInputs).toBe(2);
    expect(run?.calls).toBe(2);

    const checks = await suiteChecksFor(db, id);
    const results = await suiteResultsFor(db, id);
    expect(results).toHaveLength(4);

    const noSorry = checks.find((check) => check.kind === "must_not_contain")!;
    const outcomes = results
      .filter((result) => result.suiteCheck === noSorry.id)
      .sort((a, b) => a.inputIndex - b.inputIndex)
      .map((result) => result.outcome);
    // The echo proves the binding end to end: the model's answer *is* the bound value.
    expect(outcomes).toEqual(["pass", "fail"]);
  });

  it("keeps the evidence a failure came with, offsets and all", async () => {
    const id = await trigger([["I am sorry, no."]]);
    await runSuite(db, id, FAKE);

    const results = await suiteResultsFor(db, id);
    const failure = results.find((result) => result.outcome === "fail")!;
    expect(failure.evidence).toMatchObject({ kind: "excerpt", text: "sorry" });
  });

  it("attributes every result to exactly one blok, by reading rather than computing", async () => {
    const id = await trigger([["All good."]]);
    await runSuite(db, id, FAKE);

    const checks = await suiteChecksFor(db, id);
    expect(checks.map((check) => check.blokId)).toEqual(["blok_one", "blok_two"]);
    expect(new Set(checks.map((check) => check.blokId)).size).toBe(checks.length);
  });

  it("refuses in words when there is no provider, and calls nobody", async () => {
    const id = await trigger([["All good."]]);
    await runSuite(db, id, NONE);

    const run = await suiteRunById(db, id);
    expect(run?.state).toBe("refused");
    expect(run?.refusalReason).toBe("provider_not_configured");
    expect(run?.completedInputs).toBe(0);
    expect(await suiteResultsFor(db, id)).toHaveLength(0);
  });

  it("answers a re-run from the cache: no calls, no spend", async () => {
    const first = await trigger([["All good."]]);
    await runSuite(db, first, FAKE);
    const firstRun = await suiteRunById(db, first);
    expect(firstRun?.calls).toBe(1);
    expect(firstRun?.costCents).toBeGreaterThan(0);

    const second = await trigger([["All good."]]);
    await runSuite(db, second, FAKE);
    const secondRun = await suiteRunById(db, second);
    expect(secondRun?.calls).toBe(0);
    expect(secondRun?.cachedCalls).toBe(1);
    expect(secondRun?.costCents).toBe(0);
    // And it still has its own results — a cached answer is graded like any other.
    expect(await suiteResultsFor(db, second)).toHaveLength(2);
  });

  it("does not run a job twice, so a retry cannot double-charge", async () => {
    const id = await trigger([["All good."]]);
    await runSuite(db, id, FAKE);
    await runSuite(db, id, FAKE);

    expect(await suiteResultsFor(db, id)).toHaveLength(2);
  });

  it("stops at the budget cap and keeps what already ran", async () => {
    // Derived from the price table rather than written as a number: the cap is exactly one
    // reservation for a slightly larger prompt than this one, so the first input fits and the
    // second cannot — and it stays true if a price changes.
    const capCents = reservationCentsFor(priceFor(DEFAULT_RUN_MODEL)!, 50);
    await db.update(runBudgets).set({ capCents, spentCents: 0 }).where(eq(runBudgets.owner, OWNER));
    const id = await trigger([["First answer."], ["Second answer."], ["Third answer."]]);
    await runSuite(db, id, FAKE);

    const run = await suiteRunById(db, id);
    // `done`, not `refused`: something ran, and throwing that away buys a cleaner story at the
    // user's expense (EPIC-031 decision 6).
    expect(run?.state).toBe("done");
    expect(run?.refusalReason).toBe("budget_exhausted");
    expect(run?.completedInputs).toBeGreaterThan(0);
    expect(run?.completedInputs).toBeLessThan(3);
  });
});
