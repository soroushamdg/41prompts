import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { modelKeys, type Provider } from "@/db/schema";
import { keyAad, open, seal } from "./crypto";

/* Model keys (M07). The plaintext only exists inside the request that runs
   or tests a key; listing returns the last four characters and the date. */

export type KeySummary = { provider: Provider; last4: string; createdAt: string };

export async function saveKey(db: Db, userId: string, provider: Provider, apiKey: string): Promise<KeySummary> {
  const sealed = seal(apiKey, keyAad(userId, provider));
  const last4 = apiKey.slice(-4);
  const [row] = await db
    .insert(modelKeys)
    .values({ userId, provider, ...sealed, last4 })
    .onConflictDoUpdate({ target: [modelKeys.userId, modelKeys.provider], set: { ...sealed, last4, createdAt: new Date() } })
    .returning({ createdAt: modelKeys.createdAt });
  return { provider, last4, createdAt: row!.createdAt.toISOString() };
}

export async function listKeys(db: Db, userId: string): Promise<KeySummary[]> {
  const rows = await db.select({ provider: modelKeys.provider, last4: modelKeys.last4, createdAt: modelKeys.createdAt }).from(modelKeys).where(eq(modelKeys.userId, userId));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function readKey(db: Db, userId: string, provider: Provider): Promise<string | null> {
  const [row] = await db.select().from(modelKeys).where(and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider)));
  if (!row) return null;
  return open(row, keyAad(userId, provider));
}

export async function removeKey(db: Db, userId: string, provider: Provider): Promise<void> {
  await db.delete(modelKeys).where(and(eq(modelKeys.userId, userId), eq(modelKeys.provider, provider)));
}
