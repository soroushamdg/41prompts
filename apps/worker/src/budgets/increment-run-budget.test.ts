import { createDb, planBudgetDefaults, runBudgets, users, type Db } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "@41prompts/db";
import { getOrCreateRunBudget, incrementRunBudget } from "./increment-run-budget";

const TEST_PLAN = "budget-test-plan";
const TEST_CAP_CENTS = 1000;

function testUserId(suffix: string): string {
  return `budget-test-user-${suffix}`;
}

announceDatabaseSkip("run budget increment");

describe.skipIf(!HAS_TEST_DATABASE)("run budget increment", () => {
  let db: Db;

  beforeAll(async () => {
    const databaseUrl = testDatabaseUrl();
    db = createDb(databaseUrl);
    await db
      .insert(planBudgetDefaults)
      .values({ plan: TEST_PLAN, monthlyCapCents: TEST_CAP_CENTS })
      .onConflictDoNothing({ target: planBudgetDefaults.plan });
  });

  afterAll(async () => {
    await db.delete(planBudgetDefaults).where(eq(planBudgetDefaults.plan, TEST_PLAN));
  });

  async function makeTestUser(id: string): Promise<void> {
    await db
      .insert(users)
      .values({
        id,
        name: "Budget test",
        email: `${id}@example.com`,
        emailVerified: true,
        plan: TEST_PLAN,
      })
      .onConflictDoNothing({ target: users.id });
  }

  // Cascades to the user's run_budgets row (schema.ts's ON DELETE CASCADE).
  async function cleanupUser(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  it("creates a run budget from the owner's plan default on first use", async () => {
    const owner = testUserId("create");
    await makeTestUser(owner);
    try {
      const budget = await getOrCreateRunBudget(db, owner);
      expect(budget.capCents).toBe(TEST_CAP_CENTS);
      expect(budget.spentCents).toBe(0);
    } finally {
      await cleanupUser(owner);
    }
  });

  it("is idempotent: a second get-or-create returns the same row", async () => {
    const owner = testUserId("idempotent");
    await makeTestUser(owner);
    try {
      const first = await getOrCreateRunBudget(db, owner);
      const second = await getOrCreateRunBudget(db, owner);
      expect(second.id).toBe(first.id);
    } finally {
      await cleanupUser(owner);
    }
  });

  it("allows an increment under the cap", async () => {
    const owner = testUserId("under");
    await makeTestUser(owner);
    try {
      const result = await incrementRunBudget(db, owner, 100);
      expect(result.allowed).toBe(true);
      expect(result.budget.spentCents).toBe(100);
    } finally {
      await cleanupUser(owner);
    }
  });

  it("allows an increment that lands exactly on the cap (the boundary)", async () => {
    const owner = testUserId("boundary");
    await makeTestUser(owner);
    try {
      await incrementRunBudget(db, owner, TEST_CAP_CENTS - 1);
      const second = await incrementRunBudget(db, owner, 1);
      expect(second.allowed).toBe(true);
      expect(second.budget.spentCents).toBe(TEST_CAP_CENTS);
    } finally {
      await cleanupUser(owner);
    }
  });

  it("rejects an increment that would cross the cap, leaving spend unchanged", async () => {
    const owner = testUserId("over");
    await makeTestUser(owner);
    try {
      await incrementRunBudget(db, owner, TEST_CAP_CENTS - 1);
      const rejected = await incrementRunBudget(db, owner, 2);
      expect(rejected.allowed).toBe(false);
      expect(rejected.budget.spentCents).toBe(TEST_CAP_CENTS - 1);
    } finally {
      await cleanupUser(owner);
    }
  });

  it("rejects a negative amount", async () => {
    const owner = testUserId("negative");
    await makeTestUser(owner);
    try {
      await expect(incrementRunBudget(db, owner, -1)).rejects.toThrow("amountCents must not be negative");
    } finally {
      await cleanupUser(owner);
    }
  });

  it("under concurrent increments, never spends past the cap", async () => {
    const owner = testUserId("concurrent");
    await makeTestUser(owner);
    try {
      // 20 parallel 100-cent increments against a 1000-cent cap: exactly 10 can succeed, no
      // matter how the database interleaves them — that guarantee is what this test is for.
      const attempts = Array.from({ length: 20 }, () => incrementRunBudget(db, owner, 100));
      const results = await Promise.all(attempts);

      const allowedCount = results.filter((result) => result.allowed).length;
      expect(allowedCount).toBe(10);

      const [final] = await db.select().from(runBudgets).where(eq(runBudgets.owner, owner));
      expect(final?.spentCents).toBe(TEST_CAP_CENTS);
    } finally {
      await cleanupUser(owner);
    }
  });
});
