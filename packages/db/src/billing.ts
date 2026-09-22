import { and, count, eq, gte, inArray, lt, lte } from "drizzle-orm";
import type { Db } from "./client";
import { plans, subscriptions, suiteRuns } from "./schema";

/**
 * What plan an account is on, and what that plan allows — **derived, never stored** (ADR-007 §3).
 *
 * ## The one rule this module exists to enforce
 *
 * There is no `users.plan`. EPIC-004 put one there as *"substrate for per-plan defaults … until
 * Stripe exists"*; Stripe exists now, and a second copy of what somebody is paying for is either
 * service given away or service withheld the moment the two disagree. EPIC-051 made the same call
 * for `Live` and `billing.test.ts` asserts the column has not come back.
 *
 * ## What counts as being on a paid plan
 *
 * *"A subscription row whose current period covers now, whose status is active or trialing."*
 * Three things about that are deliberate:
 *
 * 1. **`cancelAtPeriodEnd` is not consulted.** ADR-007 §5: a customer who cancels on day 3 keeps
 *    Pro until day 30. A read keyed on the cancel flag downgrades them 27 days early, which is
 *    taking back something they paid for.
 * 2. **The period is checked against the clock**, so an expired row stops granting anything even
 *    if a webhook was missed. The webhook is how we learn promptly; the period is what is true.
 * 3. **`past_due` is not on the list.** Stripe keeps a subscription `past_due` while it retries a
 *    card. Dunning (EPIC-070 scope item 10) is what asks the customer to fix it; until they do,
 *    the account is on Free — which under ADR-007 §4 still reads everything it has and can still
 *    publish, so nobody's deploy breaks over a failed charge.
 */

/** The plan every account is on until something says otherwise. */
export const FREE_PLAN_KEY = "free";

/**
 * The Stripe statuses that grant a plan.
 *
 * `trialing` is here because the epic scopes a 14-day trial and a trial that grants nothing is not
 * a trial. Everything else Stripe can report — `past_due`, `canceled`, `unpaid`, `incomplete`,
 * `incomplete_expired`, `paused` — grants nothing, and the list is written as what **does** grant
 * rather than what does not so that a status Stripe adds later is denied by default.
 */
export const GRANTING_STATUSES: readonly string[] = ["active", "trialing"];

export type Plan = typeof plans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;

/**
 * The account's plan key right now.
 *
 * Returns `FREE_PLAN_KEY` when there is no granting subscription, which is the same answer for
 * "never subscribed", "cancelled last month" and "card is failing". That is intentional: they are
 * the same state as far as what the product allows, and the Billing page is where the difference
 * between them is explained.
 */
export async function planKeyFor(db: Db, owner: string, now: Date = new Date()): Promise<string> {
  const [row] = await db
    .select({ planKey: subscriptions.planKey })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.owner, owner),
        inArray(subscriptions.status, [...GRANTING_STATUSES]),
        lte(subscriptions.currentPeriodStart, now),
        gte(subscriptions.currentPeriodEnd, now)
      )
    )
    .limit(1);
  return row?.planKey ?? FREE_PLAN_KEY;
}

/** The whole plan row, falling back to Free. Throws if the migration never seeded Free. */
export async function planFor(db: Db, owner: string, now: Date = new Date()): Promise<Plan> {
  const key = await planKeyFor(db, owner, now);
  const [plan] = await db.select().from(plans).where(eq(plans.key, key));
  if (plan) return plan;

  const [free] = await db.select().from(plans).where(eq(plans.key, FREE_PLAN_KEY));
  if (!free) {
    throw new Error(`plans has no "${FREE_PLAN_KEY}" row — migration not applied?`);
  }
  return free;
}

/**
 * The granting subscription row, or `undefined`. For the Billing page, which needs the dates.
 *
 * Same predicate as `planKeyFor` so the page and the enforcement cannot disagree about whether
 * somebody is on a plan — two predicates would be the copy this module exists to avoid, one level
 * up.
 */
export async function subscriptionFor(
  db: Db,
  owner: string,
  now: Date = new Date()
): Promise<Subscription | undefined> {
  const [row] = await db
    .select()
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.owner, owner),
        inArray(subscriptions.status, [...GRANTING_STATUSES]),
        lte(subscriptions.currentPeriodStart, now),
        gte(subscriptions.currentPeriodEnd, now)
      )
    )
    .limit(1);
  return row;
}

/**
 * The window runs are counted in.
 *
 * On a paid plan it is Stripe's billing period, so the number a customer sees resets when they are
 * charged rather than on a date we invented. With no subscription it is the calendar month in UTC —
 * there is no billing period to borrow, and a rolling 30-day window would mean the meter on the
 * Billing page never shows a clean zero and nobody could tell when it resets.
 */
export interface UsagePeriod {
  readonly start: Date;
  readonly end: Date;
  /** True when the window is Stripe's rather than the calendar's. */
  readonly fromSubscription: boolean;
}

export function calendarMonth(now: Date): UsagePeriod {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { start, end, fromSubscription: false };
}

export async function usagePeriodFor(db: Db, owner: string, now: Date = new Date()): Promise<UsagePeriod> {
  const subscription = await subscriptionFor(db, owner, now);
  if (!subscription) return calendarMonth(now);
  return {
    start: subscription.currentPeriodStart,
    end: subscription.currentPeriodEnd,
    fromSubscription: true,
  };
}

/**
 * How many runs this account has started in the period — **counted, not stored**.
 *
 * ## Why a query rather than a counter column
 *
 * A stored counter needs a reset, and a reset needs somebody to run it on a boundary that moves
 * whenever Stripe moves the billing period. A count over rows that already exist cannot drift, has
 * no boundary job, and is right the first time somebody's period shifts because they upgraded
 * mid-month. `run_budgets.spentCents` is a stored counter for the opposite reason — it must be
 * decremented and cap-checked inside one atomic statement, which a count cannot do.
 *
 * ## A run is a `suite_runs` row
 *
 * The thing a person triggers and the thing the Runs page lists — not a `runs` row, which is one
 * model call inside one of them. The two differ by roughly two orders of magnitude, so `/pricing`
 * saying "50 runs" while the code counted model calls would be a 100× overstatement of what is
 * sold. `RUN_COUNT_RETENTION_DAYS` is 180, comfortably longer than any billing period, so the rows
 * being counted are always still there.
 */
export async function runsUsedIn(db: Db, owner: string, period: UsagePeriod): Promise<number> {
  const [row] = await db
    .select({ used: count() })
    .from(suiteRuns)
    .where(
      and(eq(suiteRuns.owner, owner), gte(suiteRuns.createdAt, period.start), lt(suiteRuns.createdAt, period.end))
    );
  return row?.used ?? 0;
}

/** Everything the Billing page and the run gate both need, in one round of queries. */
export interface PlanUsage {
  readonly plan: Plan;
  readonly period: UsagePeriod;
  readonly runsUsed: number;
  readonly runsRemaining: number;
  /** True when a further run would exceed `plan.monthlyRunLimit`. */
  readonly overRunLimit: boolean;
  readonly subscription: Subscription | undefined;
}

export async function planUsageFor(db: Db, owner: string, now: Date = new Date()): Promise<PlanUsage> {
  const subscription = await subscriptionFor(db, owner, now);
  const planKey = subscription?.planKey ?? FREE_PLAN_KEY;

  const [found] = await db.select().from(plans).where(eq(plans.key, planKey));
  let plan = found;
  if (!plan) {
    const [free] = await db.select().from(plans).where(eq(plans.key, FREE_PLAN_KEY));
    if (!free) throw new Error(`plans has no "${FREE_PLAN_KEY}" row — migration not applied?`);
    plan = free;
  }

  const period = subscription
    ? { start: subscription.currentPeriodStart, end: subscription.currentPeriodEnd, fromSubscription: true }
    : calendarMonth(now);
  const runsUsed = await runsUsedIn(db, owner, period);

  return {
    plan,
    period,
    runsUsed,
    runsRemaining: Math.max(0, plan.monthlyRunLimit - runsUsed),
    overRunLimit: runsUsed >= plan.monthlyRunLimit,
    subscription,
  };
}
