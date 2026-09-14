import {
  announceDatabaseSkip,
  createDb,
  HAS_TEST_DATABASE,
  prompts,
  projects,
  runs,
  RUN_PAYLOAD_RETENTION_DAYS,
  testDatabaseUrl,
  users,
  type Db
} from "@41prompts/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { countOverdueRunPayloads, purgeAfterFor, purgeRunPayloads } from "./purge-run-payloads";

const REFERENCE_NOW = () => new Date("2027-01-31T00:00:00.000Z");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

const OWNER = "usr_purge_run_payloads_test";
const PROJECT = "proj_rpt0";
const PROMPT = "pr_rpt00001";
const IDS = ["run_rpt00001", "run_rpt00002", "run_rpt00003", "run_rpt00004"];

function daysFromReferenceNow(days: number): Date {
  return new Date(REFERENCE_NOW().getTime() + days * DAY_IN_MS);
}

async function insert(db: Db, id: string, purgeAfter: Date): Promise<void> {
  await db.insert(runs).values({
    id,
    owner: OWNER,
    prompt: PROMPT,
    payload: { content: "a model said something" },
    promptHash: "a".repeat(16),
    inputHash: "b".repeat(16),
    model: "claude-sonnet-5",
    params: { temperature: 0 },
    latencyMs: 1234,
    costCents: 7,
    purgeAfter,
    cacheKey: `key-${id}`
  });
}

announceDatabaseSkip("purgeRunPayloads");

describe.skipIf(!HAS_TEST_DATABASE)("purgeRunPayloads", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Purge test", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "Purge test", slug: `purge-test-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "Purge test" });
  });

  beforeEach(async () => {
    await db.delete(runs).where(inArray(runs.id, IDS));
  });

  afterAll(async () => {
    // Cascades through prompts and runs.
    await db.delete(users).where(eq(users.id, OWNER));
  });

  /**
   * **The clock test the roadmap asks for.** It proves the query, which is the half that cannot be
   * observed for twelve months in production.
   */
  it("deletes exactly the rows whose purge date has passed, and no others", async () => {
    await insert(db, IDS[0]!, daysFromReferenceNow(-1)); // due yesterday
    await insert(db, IDS[1]!, daysFromReferenceNow(-400)); // long overdue
    await insert(db, IDS[2]!, daysFromReferenceNow(1)); // due tomorrow
    await insert(db, IDS[3]!, daysFromReferenceNow(364)); // written today, under the window

    const purged = await purgeRunPayloads(db, REFERENCE_NOW);
    expect(purged).toBe(2);

    const left = await db.select({ id: runs.id }).from(runs).where(inArray(runs.id, IDS));
    expect(left.map((row) => row.id).sort()).toEqual([IDS[2], IDS[3]].sort());
  });

  it("deletes a row due exactly now, because the promise is that it is gone by then", async () => {
    await insert(db, IDS[0]!, REFERENCE_NOW());
    expect(await purgeRunPayloads(db, REFERENCE_NOW)).toBe(1);
  });

  it("is idempotent — a second sweep finds nothing and deletes nothing", async () => {
    await insert(db, IDS[0]!, daysFromReferenceNow(-1));
    expect(await purgeRunPayloads(db, REFERENCE_NOW)).toBe(1);
    expect(await purgeRunPayloads(db, REFERENCE_NOW)).toBe(0);
  });

  it("deletes the whole row, not just the payload", async () => {
    // The page promises the response is kept twelve months. A surviving skeleton of hashes, model,
    // cost and timing is still a record that this person ran this prompt that day — technically
    // true, practically misleading, which is the failure EPIC-017 exists to avoid.
    await insert(db, IDS[0]!, daysFromReferenceNow(-1));
    await purgeRunPayloads(db, REFERENCE_NOW);
    const left = await db.select({ id: runs.id }).from(runs).where(eq(runs.id, IDS[0]!));
    expect(left).toEqual([]);
  });
});

/**
 * **The defence that would have caught EPIC-006d**, tested as the thing it claims to be: a number
 * that is zero when the outcome is true and grows when it is not.
 *
 * A twelve-month purge that works and one whose `WHERE` never matches both log `0 purged` every
 * night for a year. This is the number that differs, which is why it exists and why it is asserted
 * rather than merely logged.
 */
describe.skipIf(!HAS_TEST_DATABASE)("countOverdueRunPayloads", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db.delete(users).where(eq(users.id, OWNER));
    await db.insert(users).values({ id: OWNER, name: "Purge test", email: `${OWNER}@example.com`, emailVerified: true });
    await db.insert(projects).values({ id: PROJECT, owner: OWNER, name: "Purge test", slug: `purge-test-${PROJECT}` });
    await db.insert(prompts).values({ id: PROMPT, project: PROJECT, name: "Purge test" });
  });

  beforeEach(async () => {
    await db.delete(runs).where(inArray(runs.id, IDS));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, OWNER));
  });

  it("is zero after a sweep that did its job", async () => {
    await insert(db, IDS[0]!, daysFromReferenceNow(-1));
    await insert(db, IDS[1]!, daysFromReferenceNow(30));
    await purgeRunPayloads(db, REFERENCE_NOW);
    expect(await countOverdueRunPayloads(db, REFERENCE_NOW)).toBe(0);
  });

  it("counts what a broken sweep would have left behind", async () => {
    // The sweep is deliberately not run here — this is the state the number exists to make visible.
    await insert(db, IDS[0]!, daysFromReferenceNow(-1));
    await insert(db, IDS[1]!, daysFromReferenceNow(-400));
    await insert(db, IDS[2]!, daysFromReferenceNow(5));
    expect(await countOverdueRunPayloads(db, REFERENCE_NOW)).toBe(2);
  });

  it("does not count rows that are merely old but still inside their window", async () => {
    await insert(db, IDS[0]!, daysFromReferenceNow(1));
    expect(await countOverdueRunPayloads(db, REFERENCE_NOW)).toBe(0);
  });
});

describe("purgeAfterFor", () => {
  /**
   * The stamp and the constant are the same number, so the page's promise and the row's clock cannot
   * disagree. The page imports `RUN_PAYLOAD_RETENTION_DAYS`; this writes it.
   */
  it("stamps a row exactly the retention window ahead", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const expected = new Date(now.getTime() + RUN_PAYLOAD_RETENTION_DAYS * DAY_IN_MS);
    expect(purgeAfterFor(now).toISOString()).toBe(expected.toISOString());
  });

  /**
   * **Written at insert, not derived at read**, and this is what that buys.
   *
   * A row stamped under today's window keeps today's window. A `created_at < now() - interval` query
   * would re-date every existing row the moment the constant changed, silently moving rows written
   * under a twelve-month promise onto whatever the new one is — the wrong direction for a promise.
   */
  it("produces a date that does not move when the window later changes", () => {
    const now = new Date("2026-09-14T12:00:00.000Z");
    const stamped = purgeAfterFor(now);
    // Whatever RUN_PAYLOAD_RETENTION_DAYS becomes, this row's date is already decided.
    expect(stamped.getTime()).toBe(now.getTime() + RUN_PAYLOAD_RETENTION_DAYS * DAY_IN_MS);
    expect(stamped > now).toBe(true);
  });
});
