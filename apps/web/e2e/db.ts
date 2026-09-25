import {
  bloks,
  createDb,
  promptVersions,
  providerKeys,
  sessions,
  subscriptions,
  suiteRuns,
  users,
  verifications,
} from "@41prompts/db";
import { desc, eq, sql } from "drizzle-orm";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the e2e suite");
}

export const db = createDb(databaseUrl);

// Reads the plain-text magic-link token straight from the verifications table — the same
// thing this app's own database sees, not an inbox — per the epic's own test guidance.
export async function latestMagicLinkTokenFor(email: string): Promise<string> {
  const [row] = await db
    .select({ identifier: verifications.identifier })
    .from(verifications)
    .where(sql`(${verifications.value}::jsonb ->> 'email') = ${email}`)
    .orderBy(desc(verifications.createdAt))
    .limit(1);

  if (!row) {
    throw new Error(`no verification row found for ${email}`);
  }
  return row.identifier;
}

export async function sessionCountFor(email: string): Promise<number> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(users.email, email));
  return rows.length;
}

export async function deleteTestUser(email: string): Promise<void> {
  await db.delete(users).where(eq(users.email, email));
}

/**
 * Every blok of a prompt with its `updatedAt`, read straight from the table.
 *
 * EPIC-021a decision 5's criterion is a **database** fact — "no existing blok's `updatedAt` moves"
 * — and EPIC-032 inherits it for "create constraint from this failure". Asserting it through the
 * page would only prove the page did not re-render something, which is a different claim.
 */
export async function blokTimestampsFor(promptId: string): Promise<{ id: string; updatedAt: Date }[]> {
  return db
    .select({ id: bloks.id, updatedAt: bloks.updatedAt })
    .from(bloks)
    .where(eq(bloks.prompt, promptId))
    .orderBy(bloks.createdAt);
}

/**
 * A prompt's versions, newest first, read straight from the table (EPIC-040).
 *
 * **A database fact, asserted as one.** Whether a save minted a version, rewrote one or wrote
 * nothing is not visible anywhere on screen in this epic — EPIC-041 is the Versions page — so
 * asserting it through the UI would be asserting something else. These rows are the criterion.
 */
export async function versionsFor(
  promptId: string,
): Promise<{ id: string; n: number; compiledText: string; pinnedAt: Date | null }[]> {
  return db
    .select({
      id: promptVersions.id,
      n: promptVersions.n,
      compiledText: promptVersions.compiledText,
      pinnedAt: promptVersions.pinnedAt,
    })
    .from(promptVersions)
    .where(eq(promptVersions.prompt, promptId))
    .orderBy(desc(promptVersions.n));
}

/** The version a run was pinned to, or null for a run that predates EPIC-040. */
export async function versionOfRun(suiteRunId: string): Promise<string | null> {
  const [row] = await db
    .select({ version: suiteRuns.version })
    .from(suiteRuns)
    .where(eq(suiteRuns.id, suiteRunId))
    .limit(1);
  return row?.version ?? null;
}

/**
 * A prompt's runs with the two EPIC-041 columns, read straight from the table.
 *
 * Whether an A/B produced **two** runs sharing **one** `comparison`, each pinned to its **own**
 * version, is a database fact: the page shows two rows either way, and a surface assertion could not
 * tell one comparison from two coincidental runs.
 */
export async function runsFor(
  promptId: string,
): Promise<{ id: string; version: string | null; comparison: string | null; promptText: string }[]> {
  return db
    .select({
      id: suiteRuns.id,
      version: suiteRuns.version,
      comparison: suiteRuns.comparison,
      promptText: suiteRuns.promptText,
    })
    .from(suiteRuns)
    .where(eq(suiteRuns.prompt, promptId))
    .orderBy(suiteRuns.createdAt);
}

/** Every blok of a prompt including the soft-deleted ones — what "restore never deletes" is about. */
export async function everyBlokFor(
  promptId: string,
): Promise<{ id: string; text: string; kind: string; deletedAt: Date | null }[]> {
  return db
    .select({ id: bloks.id, text: bloks.text, kind: bloks.kind, deletedAt: bloks.deletedAt })
    .from(bloks)
    .where(eq(bloks.prompt, promptId))
    .orderBy(bloks.createdAt);
}

/**
 * The stored provider keys for one person, **as the database holds them** (EPIC-042).
 *
 * Read here rather than through the page for the assertion the page cannot make: that the column
 * holds a sealed envelope and never the key. A settings page showing four characters proves only
 * that the page shows four characters.
 */
export async function providerKeysFor(
  email: string,
): Promise<{ provider: string; sealed: string; lastFour: string; enabled: boolean }[]> {
  return db
    .select({
      provider: providerKeys.provider,
      sealed: providerKeys.sealed,
      lastFour: providerKeys.lastFour,
      enabled: providerKeys.enabled,
    })
    .from(providerKeys)
    .innerJoin(users, eq(providerKeys.owner, users.id))
    .where(eq(users.email, email))
    .orderBy(providerKeys.provider);
}

/**
 * Put an account on a paid plan, for a suite whose subject is not billing (EPIC-070).
 *
 * ## Why this exists rather than the suite buying a plan
 *
 * EPIC-070 made bringing a provider key a Pro feature, and `providers.spec.ts` is five tests about
 * what happens to a key **once it is stored** — none of them is about the plan. Driving a Stripe
 * Checkout at the top of that file would make it depend on a network, a card and a webhook to
 * assert something about sealing, which is the shape of a test that fails for reasons unrelated to
 * what it is testing.
 *
 * **This is the one place a subscription is written by hand, and the drive deliberately does not
 * use it.** `scripts/drive-epic-070.mts` buys the plan through Checkout with a real test card,
 * because `docs/AUTONOMOUS.md` is explicit that driving the creation path is part of the test. A
 * spec establishing a precondition and a drive proving the path are different jobs.
 *
 * The row is what the webhook would have written: `active`, a period covering now, and a plan key
 * the `plans` table holds — so `planKeyFor` answers from the same predicate it always does and
 * nothing here special-cases a test.
 */
export async function putOnPlan(email: string, planKey = "pro"): Promise<void> {
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error(`no user with email ${email}`);

  const now = Date.now();
  await db
    .insert(subscriptions)
    .values({
      id: `sub_e2e_${user.id.slice(-12)}`,
      owner: user.id,
      stripeCustomerId: `cus_e2e_${user.id.slice(-12)}`,
      planKey,
      status: "active",
      currentPeriodStart: new Date(now - 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now + 29 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
    })
    .onConflictDoNothing({ target: subscriptions.id });
}
