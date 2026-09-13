import { createDb, users, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "@41prompts/db";
import { purgeDeletedUsers } from "./purge-deleted-users";

const TEST_EMAIL_PREFIX = "purge-job-test+";
const REFERENCE_NOW = () => new Date("2026-01-31T00:00:00.000Z");
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function daysBeforeReferenceNow(days: number): Date {
  return new Date(REFERENCE_NOW().getTime() - days * DAY_IN_MS);
}

function testEmail(suffix: string): string {
  return `${TEST_EMAIL_PREFIX}${suffix}@example.com`;
}

async function insertSoftDeletedUser(db: Db, id: string, deletedAt: Date): Promise<void> {
  await db.insert(users).values({
    id,
    name: "Purge job test",
    email: testEmail(id),
    emailVerified: true,
    deletedAt,
  });
}

announceDatabaseSkip("purgeDeletedUsers");

describe.skipIf(!HAS_TEST_DATABASE)("purgeDeletedUsers", () => {
  let db: Db;

  beforeAll(() => {
    const databaseUrl = testDatabaseUrl();
    db = createDb(databaseUrl);
  });

  beforeEach(async () => {
    await db.delete(users).where(eq(users.email, testEmail("29-days")));
    await db.delete(users).where(eq(users.email, testEmail("31-days")));
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.email, testEmail("29-days")));
    await db.delete(users).where(eq(users.email, testEmail("31-days")));
  });

  it("does not purge a user soft-deleted 29 days ago", async () => {
    await insertSoftDeletedUser(db, "29-days", daysBeforeReferenceNow(29));

    const purged = await purgeDeletedUsers(db, REFERENCE_NOW);

    expect(purged).toBe(0);
    const [row] = await db.select().from(users).where(eq(users.email, testEmail("29-days")));
    expect(row).toBeDefined();
  });

  it("purges a user soft-deleted 31 days ago", async () => {
    await insertSoftDeletedUser(db, "31-days", daysBeforeReferenceNow(31));

    const purged = await purgeDeletedUsers(db, REFERENCE_NOW);

    expect(purged).toBe(1);
    const [row] = await db.select().from(users).where(eq(users.email, testEmail("31-days")));
    expect(row).toBeUndefined();
  });

  it("is idempotent: a second run the same day purges nothing more", async () => {
    await insertSoftDeletedUser(db, "31-days", daysBeforeReferenceNow(31));

    const first = await purgeDeletedUsers(db, REFERENCE_NOW);
    const second = await purgeDeletedUsers(db, REFERENCE_NOW);

    expect(first).toBe(1);
    expect(second).toBe(0);
  });

  it("is safe to run against an empty table", async () => {
    await expect(purgeDeletedUsers(db, REFERENCE_NOW)).resolves.toBe(0);
  });
});
