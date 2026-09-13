import { createDb, DECOMPILE_RETENTION_DAYS, decompiles, type Db } from "@41prompts/db";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "@41prompts/db";
import { purgeDecompiles } from "./purge-decompiles";

const REFERENCE_NOW = () => new Date("2026-01-31T00:00:00.000Z");
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const IDS = ["dc_purgetest0029", "dc_purgetest0031", "dc_purgetest0030"];

function daysBeforeReferenceNow(days: number): Date {
  return new Date(REFERENCE_NOW().getTime() - days * DAY_IN_MS);
}

async function insert(db: Db, id: string, createdAt: Date): Promise<void> {
  await db.insert(decompiles).values({ id, source: "You are a test.", createdAt });
}

announceDatabaseSkip("purgeDecompiles");

describe.skipIf(!HAS_TEST_DATABASE)("purgeDecompiles", () => {
  let db: Db;

  beforeAll(() => {
    const databaseUrl = testDatabaseUrl();
    db = createDb(databaseUrl);
  });

  beforeEach(async () => {
    await db.delete(decompiles).where(inArray(decompiles.id, IDS));
  });

  afterAll(async () => {
    await db.delete(decompiles).where(inArray(decompiles.id, IDS));
  });

  it(`deletes a decompile older than ${DECOMPILE_RETENTION_DAYS} days`, async () => {
    await insert(db, "dc_purgetest0031", daysBeforeReferenceNow(DECOMPILE_RETENTION_DAYS + 1));
    const purged = await purgeDecompiles(db, REFERENCE_NOW);
    expect(purged).toBeGreaterThanOrEqual(1);

    // The row is *gone*, not flagged. The page promises a stranger their paste is deleted, and a
    // soft delete would make that sentence false while looking true.
    const rows = await db.select().from(decompiles).where(eq(decompiles.id, "dc_purgetest0031"));
    expect(rows).toEqual([]);
  });

  it(`keeps a decompile one day younger than ${DECOMPILE_RETENTION_DAYS} days`, async () => {
    await insert(db, "dc_purgetest0029", daysBeforeReferenceNow(DECOMPILE_RETENTION_DAYS - 1));
    await purgeDecompiles(db, REFERENCE_NOW);
    const rows = await db.select().from(decompiles).where(eq(decompiles.id, "dc_purgetest0029"));
    expect(rows).toHaveLength(1);
  });

  it("is idempotent: a second run deletes nothing", async () => {
    // The job is scheduled daily and pg-boss will re-run one that failed after doing its work, so a
    // second pass has to be free rather than merely harmless.
    await insert(db, "dc_purgetest0031", daysBeforeReferenceNow(DECOMPILE_RETENTION_DAYS + 1));
    const first = await purgeDecompiles(db, REFERENCE_NOW);
    expect(first).toBeGreaterThanOrEqual(1);
    const second = await purgeDecompiles(db, REFERENCE_NOW);
    expect(second).toBe(0);
  });

  it("does not delete a row sitting exactly on the boundary", async () => {
    // `lt`, not `lte`: on the thirtieth day the promise is still being kept, and an off-by-one here
    // deletes somebody's link a day before the sentence on the page said it would go.
    await insert(db, "dc_purgetest0030", daysBeforeReferenceNow(DECOMPILE_RETENTION_DAYS));
    await purgeDecompiles(db, REFERENCE_NOW);
    const rows = await db.select().from(decompiles).where(eq(decompiles.id, "dc_purgetest0030"));
    expect(rows).toHaveLength(1);
  });
});
