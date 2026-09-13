import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { createDb, type Db } from "./client";
import { readM1 } from "./m1-count";
import { decompileRuns, decompiles, waitlist } from "./schema";
import { and, gte, lt } from "drizzle-orm";

/**
 * A window a long way from now, on purpose.
 *
 * This runs against the shared development database, where the e2e suite and anyone running the app
 * locally are writing real rows with `now()` timestamps. `readM1` counts everything in its window —
 * that is the point of it — so the only way to test it in isolation is to put the window somewhere
 * nothing else ever writes. Filtering the query by a test marker would have meant not testing the
 * query.
 */
const FROM = new Date("2031-09-11T00:00:00.000Z");
const TO = new Date("2031-10-11T00:00:00.000Z");
const BEFORE = new Date("2031-09-10T12:00:00.000Z");
const INSIDE = new Date("2031-09-20T12:00:00.000Z");
const AFTER = new Date("2031-10-12T12:00:00.000Z");

const MARK = "m1counttest";
const YEAR_START = new Date("2031-01-01T00:00:00.000Z");
const YEAR_END = new Date("2032-01-01T00:00:00.000Z");

announceDatabaseSkip("readM1");

describe.skipIf(!HAS_TEST_DATABASE)("readM1", () => {
  let db: Db;

  beforeAll(() => {
    const databaseUrl = testDatabaseUrl();
    db = createDb(databaseUrl);
  });

  /**
   * Cleared by *timestamp*, not by a marker on the hash.
   *
   * The first version matched `ip_hash LIKE 'm1counttest%'`, which silently cannot match `NULL` —
   * so the rows written by the "caller with no address" test survived every cleanup and poisoned the
   * next run's totals. The window is already exclusive to this file, so clearing the whole year is
   * both simpler and actually complete.
   */
  async function clearTestYear(): Promise<void> {
    const year = and(gte(decompileRuns.createdAt, YEAR_START), lt(decompileRuns.createdAt, YEAR_END));
    await db.delete(decompileRuns).where(year);
    await db.delete(decompiles).where(and(gte(decompiles.createdAt, YEAR_START), lt(decompiles.createdAt, YEAR_END)));
    await db.delete(waitlist).where(and(gte(waitlist.createdAt, YEAR_START), lt(waitlist.createdAt, YEAR_END)));
  }

  beforeEach(clearTestYear);
  afterAll(clearTestYear);

  async function run(ipHash: string | null, createdAt: Date, bloks = 6, findings = 4): Promise<void> {
    await db.insert(decompileRuns).values({ ipHash, bloks, findings, createdAt });
  }

  it("counts distinct callers, not runs — the '300' is people, as far as an address hash can say", async () => {
    await run(`${MARK}-a`, INSIDE);
    await run(`${MARK}-a`, INSIDE);
    await run(`${MARK}-b`, INSIDE);

    const reading = await readM1(db, FROM, TO);
    expect(reading.runs).toBe(3);
    expect(reading.uniqueCallers).toBe(2);
  });

  it("counts a caller with no address toward runs but not toward uniques", async () => {
    // A null cannot be shown to be a *distinct* person, so counting it as one would inflate the
    // number the gate reads. It still happened, so it still counts as a run.
    await run(null, INSIDE);
    await run(null, INSIDE);
    await run(`${MARK}-a`, INSIDE);

    const reading = await readM1(db, FROM, TO);
    expect(reading.runs).toBe(3);
    expect(reading.uniqueCallers).toBe(1);
  });

  it("takes the window's edges seriously in both directions", async () => {
    await run(`${MARK}-before`, BEFORE);
    await run(`${MARK}-inside`, INSIDE);
    await run(`${MARK}-after`, AFTER);

    const reading = await readM1(db, FROM, TO);
    expect(reading.uniqueCallers).toBe(1);
  });

  it("reads the share rate off distinct sharers over distinct callers", async () => {
    for (const caller of ["a", "b", "c", "d"]) await run(`${MARK}-${caller}`, INSIDE);
    await db.insert(decompiles).values({ source: "x", ipHash: `${MARK}-a`, createdAt: INSIDE });
    await db.insert(decompiles).values({ source: "y", ipHash: `${MARK}-a`, createdAt: INSIDE });

    const reading = await readM1(db, FROM, TO);
    expect(reading.uniqueCallers).toBe(4);
    // Two links from one caller is one sharer, not two — otherwise a single enthusiast could carry
    // the rate past 15% on their own.
    expect(reading.sharers).toBe(1);
    expect(reading.shareRate).toBeCloseTo(0.25);
  });

  it("counts waitlist joins separately, because the waitlist stores no caller hash", async () => {
    await run(`${MARK}-a`, INSIDE);
    await db.insert(waitlist).values({ email: `${MARK}-one@example.com`, createdAt: INSIDE });
    await db.insert(waitlist).values({ email: `${MARK}-two@example.com`, createdAt: AFTER });

    const reading = await readM1(db, FROM, TO);
    expect(reading.waitlistJoins).toBe(1);
    // And it is deliberately not folded into shareRate: a caller-keyed numerator over a
    // non-caller-keyed one could exceed 1 and would be comparing two different things.
    expect(reading.shareRate).toBe(0);
  });

  it("reads zero rather than dividing by it", async () => {
    const reading = await readM1(db, FROM, TO);
    expect(reading).toMatchObject({ uniqueCallers: 0, runs: 0, sharers: 0, shareRate: 0 });
  });
});
