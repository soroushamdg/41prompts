import { bloks, createDb, sessions, users, verifications } from "@41prompts/db";
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
