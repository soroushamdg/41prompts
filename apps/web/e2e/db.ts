import { createDb, sessions, users, verifications } from "@41prompts/db";
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
