import { planBudgetDefaults, runBudgets, users, type Db } from "@41prompts/db";
import { eq, sql } from "drizzle-orm";

const DEFAULT_PLAN = "free";

export type RunBudget = typeof runBudgets.$inferSelect;

export interface IncrementResult {
  allowed: boolean;
  budget: RunBudget;
}

async function defaultCapCentsForOwner(db: Db, owner: string): Promise<number> {
  const [user] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, owner));
  const plan = user?.plan ?? DEFAULT_PLAN;

  const [match] = await db
    .select({ monthlyCapCents: planBudgetDefaults.monthlyCapCents })
    .from(planBudgetDefaults)
    .where(eq(planBudgetDefaults.plan, plan));
  if (match) {
    return match.monthlyCapCents;
  }

  const [fallback] = await db
    .select({ monthlyCapCents: planBudgetDefaults.monthlyCapCents })
    .from(planBudgetDefaults)
    .where(eq(planBudgetDefaults.plan, DEFAULT_PLAN));
  if (!fallback) {
    throw new Error(`plan_budget_defaults has no "${DEFAULT_PLAN}" row — migration not applied?`);
  }
  return fallback.monthlyCapCents;
}

// Empty of provider integration (EPIC-031 calls this with a real `amountCents`); this epic only
// builds the table plus the enforcement and its tests (decision 6). Race-safe against concurrent
// first-use: `onConflictDoNothing` plus a re-select fallback for whichever caller lost the race.
export async function getOrCreateRunBudget(db: Db, owner: string): Promise<RunBudget> {
  const [existing] = await db.select().from(runBudgets).where(eq(runBudgets.owner, owner));
  if (existing) {
    return existing;
  }

  const capCents = await defaultCapCentsForOwner(db, owner);
  const [created] = await db
    .insert(runBudgets)
    .values({ owner, capCents })
    .onConflictDoNothing({ target: runBudgets.owner })
    .returning();
  if (created) {
    return created;
  }

  const [row] = await db.select().from(runBudgets).where(eq(runBudgets.owner, owner));
  if (!row) {
    throw new Error(`run budget for ${owner} missing after insert race`);
  }
  return row;
}

// The one conditional `UPDATE` this whole table exists for: increment and cap-check happen in a
// single atomic statement, so concurrent callers racing on the same owner never both observe
// "room under the cap" and both write — Postgres's own row lock on the `UPDATE` serializes them.
// This is the concurrency-safe twin of `packages/core`'s `applyBudgetIncrement`, which encodes
// the identical `spentCents + amountCents <= capCents` rule for the pure, DB-free unit tests.
export async function incrementRunBudget(db: Db, owner: string, amountCents: number): Promise<IncrementResult> {
  if (amountCents < 0) {
    throw new Error("amountCents must not be negative");
  }

  await getOrCreateRunBudget(db, owner);

  const [updated] = await db
    .update(runBudgets)
    .set({
      spentCents: sql`${runBudgets.spentCents} + ${amountCents}`,
      updatedAt: new Date(),
    })
    .where(sql`${runBudgets.owner} = ${owner} and ${runBudgets.spentCents} + ${amountCents} <= ${runBudgets.capCents}`)
    .returning();

  if (updated) {
    return { allowed: true, budget: updated };
  }

  const [current] = await db.select().from(runBudgets).where(eq(runBudgets.owner, owner));
  if (!current) {
    throw new Error(`run budget for ${owner} missing`);
  }
  return { allowed: false, budget: current };
}

/**
 * Give back the part of a reservation a call did not use.
 *
 * ## Why a reservation exists at all
 *
 * EPIC-031 decision 3. Cost is known only *after* a provider call and the cap has to act *before*
 * one, so `incrementRunBudget` reserves the worst case — input tokens plus the model's maximum
 * output at list price — and this returns the difference once the real usage is known.
 *
 * The alternative was to check the cap, call, then add the actual cost. It was rejected because
 * **"exceedable by one call" is unbounded when that call carries a 200k-token context**: a
 * reservation wrong by a margin is a rounding error, a cap any single call can blow is not a cap.
 *
 * ## Why this is a separate statement and not part of the increment
 *
 * The reservation must be atomic with its cap check, and the release must not be — it happens later,
 * after the network, and it cannot fail the run. Folding them together would mean holding a row lock
 * across a provider call, which is how one slow model call blocks every other run for the same owner.
 *
 * Clamped at zero: a release can never take `spentCents` negative, whatever it is handed. A
 * reconciliation bug should cost a user some headroom, not silently mint budget.
 */
async function releaseRunBudget(db: Db, owner: string, amountCents: number): Promise<RunBudget> {
  if (amountCents < 0) {
    throw new Error("amountCents must not be negative");
  }

  const [updated] = await db
    .update(runBudgets)
    .set({
      spentCents: sql`greatest(0, ${runBudgets.spentCents} - ${amountCents})`,
      updatedAt: new Date(),
    })
    .where(eq(runBudgets.owner, owner))
    .returning();

  if (!updated) {
    throw new Error(`run budget for ${owner} missing`);
  }
  return updated;
}

/**
 * Reserve the worst case, then hand back what was not used.
 *
 * The pair, in one place, so a caller cannot reserve and forget to reconcile — which would leave a
 * user's budget permanently consumed by calls that never cost that much.
 *
 * `reconcile` receives the reservation and returns the **actual** cost. Whatever it throws, the
 * reservation is still released: a provider error must not cost somebody their month's budget.
 */
export async function withReservation<T>(
  db: Db,
  owner: string,
  reservationCents: number,
  reconcile: () => Promise<{ actualCents: number; value: T }>
): Promise<{ allowed: boolean; value?: T; actualCents?: number }> {
  const reserved = await incrementRunBudget(db, owner, reservationCents);
  if (!reserved.allowed) {
    return { allowed: false };
  }

  try {
    const { actualCents, value } = await reconcile();
    await releaseRunBudget(db, owner, Math.max(0, reservationCents - actualCents));
    return { allowed: true, value, actualCents };
  } catch (error) {
    // The whole reservation goes back. Nothing was spent, because nothing was billed — and a
    // provider outage that silently consumed a user's budget would be the kind of failure they
    // could not see, diagnose, or get back.
    await releaseRunBudget(db, owner, reservationCents);
    throw error;
  }
}
