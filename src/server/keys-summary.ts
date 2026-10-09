import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { modelKeys, type Provider } from "@/db/schema";

export async function connectedProviders(db: Db, userId: string): Promise<Provider[]> {
  const rows = await db.select({ provider: modelKeys.provider }).from(modelKeys).where(eq(modelKeys.userId, userId));
  return rows.map((r) => r.provider);
}
