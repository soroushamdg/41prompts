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
