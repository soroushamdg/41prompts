import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";

/** A fresh in-process Postgres with every migration applied. */
export async function testDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema, casing: "snake_case" });
  await migrate(db, { migrationsFolder: "drizzle" });
  return { db: db as unknown as Db, close: () => client.close() };
}

let n = 0;
/** Inserts a user row directly, as Better Auth would. */
export async function makeUser(db: Db, over: Partial<typeof schema.user.$inferInsert> = {}) {
  n += 1;
  const id = over.id ?? `user_${n}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(schema.user).values({ id, name: over.name ?? "", email: over.email ?? `${id}@example.test`, emailVerified: true, ...over });
  return id;
}
