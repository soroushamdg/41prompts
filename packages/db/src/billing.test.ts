import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_TEST_DATABASE, announceDatabaseSkip, testDatabaseUrl } from "./testing";
import { createDb, type Db } from "./client";
import {
  FREE_PLAN_KEY,
  GRANTING_STATUSES,
  calendarMonth,
  planKeyFor,
  planUsageFor,
  runsUsedIn,
  subscriptionFor,
  usagePeriodFor,
} from "./billing";
import { plans, subscriptions, users } from "./schema";

/**
 * ADR-007 §3 and §5, as tests.
 *
 * The two that matter most are the ones that are easy to get wrong in the implementation rather
 * than in the plan: **a cancelled subscription still grants until its period ends**, and **there is
 * no plan column on `users`**. Both are money — the first takes back something somebody paid for,
 * and the second is the copy that diverges.
 */

const TEST_PLAN = "billing-test-plan";
const TEST_RUN_LIMIT = 7;
const TEST_CAP_CENTS = 1234;

function testUserId(suffix: string): string {
  return `billing-test-user-${suffix}`;
}

/**
 * `users` has no plan-like column — asserted against the **schema source**, not the database.
 *
 * Deliberately outside the database-gated block below, so it runs on every machine including one
 * with no Postgres. A guard that only fires where a database happens to be configured is a guard
 * that is absent exactly where somebody is most likely to add a column back in a hurry.
 */
describe("users carries no plan state", () => {
  const source = readFileSync(join(import.meta.dirname, "schema.ts"), "utf8");
  const usersTable = source.slice(
    source.indexOf('export const users = pgTable("users"'),
    source.indexOf("export const sessions = pgTable")
  );

  it("found the users table in the source, so the assertions below mean something", () => {
    // The control on a string search: if the table were renamed, `usersTable` would be empty and
    // every "does not contain" below would pass vacuously.
    expect(usersTable).toContain('email: text("email")');
    expect(usersTable.length).toBeGreaterThan(200);
  });

  it.each(["plan", "plan_key", "subscription", "stripe_price", "tier"])(
    "declares no %s column",
    (column) => {
      // Column *declarations* only — the block's prose explains at length why the column is absent
      // and naming it there must not fail this. `text("plan")` is what a column looks like.
      expect(usersTable).not.toMatch(new RegExp(`text\\("${column}`, "i"));
      expect(usersTable).not.toMatch(new RegExp(`integer\\("${column}`, "i"));
    }
  );

  it("would catch one if it came back", () => {
    // The positive control: the matcher above fires on the shape it is looking for.
    expect('  plan: text("plan").notNull().default("free"),').toMatch(/text\("plan/i);
  });
});

announceDatabaseSkip("billing plan derivation");

describe.skipIf(!HAS_TEST_DATABASE)("billing plan derivation", () => {
  let db: Db;

  beforeAll(async () => {
    db = createDb(testDatabaseUrl());
    await db
      .insert(plans)
      .values({ key: TEST_PLAN, monthlyRunLimit: TEST_RUN_LIMIT, monthlyCapCents: TEST_CAP_CENTS })
      .onConflictDoNothing({ target: plans.key });
  });

  afterAll(async () => {
    await db.delete(plans).where(eq(plans.key, TEST_PLAN));
  });

  async function makeUser(id: string): Promise<void> {
    await db
      .insert(users)
      .values({ id, name: "Billing test", email: `${id}@example.com`, emailVerified: true })
      .onConflictDoNothing({ target: users.id });
  }

  /** Cascades to subscriptions (ON DELETE CASCADE). */
  async function cleanup(id: string): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  interface SubOptions {
    readonly status?: string;
    readonly startOffsetMs?: number;
    readonly endOffsetMs?: number;
    readonly cancelAtPeriodEnd?: boolean;
  }

  async function giveSubscription(owner: string, options: SubOptions = {}): Promise<void> {
    const now = Date.now();
    await db.insert(subscriptions).values({
      id: `sub_test_${owner}`,
      owner,
      stripeCustomerId: `cus_test_${owner}`,
      planKey: TEST_PLAN,
      status: options.status ?? "active",
      currentPeriodStart: new Date(now + (options.startOffsetMs ?? -86_400_000)),
      currentPeriodEnd: new Date(now + (options.endOffsetMs ?? 86_400_000)),
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
    });
  }

  it("an account with no subscription is on Free", async () => {
    const owner = testUserId("none");
    await makeUser(owner);
    try {
      expect(await planKeyFor(db, owner)).toBe(FREE_PLAN_KEY);
    } finally {
      await cleanup(owner);
    }
  });

  it("an active subscription inside its period grants its plan", async () => {
    const owner = testUserId("active");
    await makeUser(owner);
    try {
      await giveSubscription(owner);
      expect(await planKeyFor(db, owner)).toBe(TEST_PLAN);
    } finally {
      await cleanup(owner);
    }
  });

  /**
   * ADR-007 §5, and the reason the plan read does not look at `cancelAtPeriodEnd`.
   *
   * A customer who cancels on day 3 keeps what they bought until day 30. A read keyed on the
   * cancel flag downgrades them 27 days early, which is taking back something already paid for.
   */
  it("a subscription set to cancel at period end still grants until the period ends", async () => {
    const owner = testUserId("cancelling");
    await makeUser(owner);
    try {
      await giveSubscription(owner, { cancelAtPeriodEnd: true });
      expect(await planKeyFor(db, owner)).toBe(TEST_PLAN);
      expect((await subscriptionFor(db, owner))?.cancelAtPeriodEnd).toBe(true);
    } finally {
      await cleanup(owner);
    }
  });

  it("a subscription whose period has ended grants nothing, even if the status still says active", async () => {
    const owner = testUserId("expired");
    await makeUser(owner);
    try {
      // The webhook is how we learn promptly; the period is what is true. A missed webhook must
      // not leave somebody on a plan for ever.
      await giveSubscription(owner, { startOffsetMs: -172_800_000, endOffsetMs: -86_400_000 });
      expect(await planKeyFor(db, owner)).toBe(FREE_PLAN_KEY);
    } finally {
      await cleanup(owner);
    }
  });

  it.each(["past_due", "canceled", "unpaid", "incomplete", "paused"])(
    "status %s grants nothing",
    async (status) => {
      const owner = testUserId(`status-${status}`);
      await makeUser(owner);
      try {
        await giveSubscription(owner, { status });
        expect(await planKeyFor(db, owner)).toBe(FREE_PLAN_KEY);
      } finally {
        await cleanup(owner);
      }
    }
  );

  it.each([...GRANTING_STATUSES])("status %s grants the plan", async (status) => {
    const owner = testUserId(`grants-${status}`);
    await makeUser(owner);
    try {
      await giveSubscription(owner, { status });
      expect(await planKeyFor(db, owner)).toBe(TEST_PLAN);
    } finally {
      await cleanup(owner);
    }
  });

  it("a status Stripe has not invented yet is denied by default", async () => {
    const owner = testUserId("unknown-status");
    await makeUser(owner);
    try {
      await giveSubscription(owner, { status: "some_future_status" });
      expect(await planKeyFor(db, owner)).toBe(FREE_PLAN_KEY);
    } finally {
      await cleanup(owner);
    }
  });

  it("reports usage against the plan's run limit, and the period comes from the subscription", async () => {
    const owner = testUserId("usage");
    await makeUser(owner);
    try {
      await giveSubscription(owner);
      const usage = await planUsageFor(db, owner);
      expect(usage.plan.key).toBe(TEST_PLAN);
      expect(usage.plan.monthlyRunLimit).toBe(TEST_RUN_LIMIT);
      expect(usage.runsUsed).toBe(0);
      expect(usage.runsRemaining).toBe(TEST_RUN_LIMIT);
      expect(usage.overRunLimit).toBe(false);
      expect(usage.period.fromSubscription).toBe(true);
    } finally {
      await cleanup(owner);
    }
  });

  it("falls back to the calendar month when there is no subscription to borrow a period from", async () => {
    const owner = testUserId("calendar");
    await makeUser(owner);
    try {
      const period = await usagePeriodFor(db, owner);
      expect(period.fromSubscription).toBe(false);
      expect(period.start.getUTCDate()).toBe(1);
      expect(await runsUsedIn(db, owner, period)).toBe(0);
    } finally {
      await cleanup(owner);
    }
  });
});

describe("the calendar month window", () => {
  it("runs from the first of the month to the first of the next, in UTC", () => {
    const period = calendarMonth(new Date("2026-09-22T09:13:43Z"));
    expect(period.start.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(period.fromSubscription).toBe(false);
  });

  it("rolls the year over in December", () => {
    const period = calendarMonth(new Date("2026-12-31T23:59:59Z"));
    expect(period.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });

  it("is half-open, so a run at midnight on the first belongs to the new month and not both", () => {
    // `runsUsedIn` uses `>= start` and `< end`. If `end` were inclusive a run at the boundary
    // would be counted in two periods, which is how a customer is charged a quota twice.
    const september = calendarMonth(new Date("2026-09-15T00:00:00Z"));
    const october = calendarMonth(new Date("2026-10-15T00:00:00Z"));
    expect(september.end.toISOString()).toBe(october.start.toISOString());
  });
});
