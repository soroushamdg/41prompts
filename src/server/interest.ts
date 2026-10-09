import "server-only";
import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { performanceInterest } from "@/db/schema";

export async function recordInterest(db: Db, userId: string, feature: string): Promise<void> {
  await db.insert(performanceInterest).values({ userId, feature: feature.slice(0, 60) }).onConflictDoNothing();
}

export async function hasInterest(db: Db, userId: string): Promise<boolean> {
  const rows = await db.select({ userId: performanceInterest.userId }).from(performanceInterest).where(eq(performanceInterest.userId, userId));
  return rows.length > 0;
}
