import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { reviewPrompts } from "@/db/schema";
import { REVIEW_RULES, type ReviewStage, type ReviewState } from "@/lib/product-hunt";

export async function getReviewState(db: Db, userId: string, accountCreatedAt: Date): Promise<ReviewState> {
  const [row] = await db.select().from(reviewPrompts).where(eq(reviewPrompts.userId, userId));
  return {
    status: row?.status ?? "open",
    snoozedUntil: row?.snoozedUntil?.toISOString() ?? null,
    askCount: row?.askCount ?? 0,
    lastAskedAt: row?.lastAskedAt?.toISOString() ?? null,
    accountCreatedAt: accountCreatedAt.toISOString(),
  };
}

export async function recordReviewAsked(db: Db, userId: string, stage: ReviewStage): Promise<void> {
  const now = new Date();
  await db
    .insert(reviewPrompts)
    .values({ userId, askCount: 1, lastStage: stage, lastAskedAt: now, updatedAt: now })
    .onConflictDoUpdate({ target: reviewPrompts.userId, set: { askCount: sql`${reviewPrompts.askCount} + 1`, lastStage: stage, lastAskedAt: now, updatedAt: now } });
}

export async function setReviewStatus(db: Db, userId: string, status: "snoozed" | "never" | "reviewed"): Promise<void> {
  const now = new Date();
  const snoozedUntil = status === "snoozed" ? new Date(now.getTime() + REVIEW_RULES.snoozeDays * 86_400_000) : null;
  await db
    .insert(reviewPrompts)
    .values({ userId, status, snoozedUntil, updatedAt: now })
    .onConflictDoUpdate({ target: reviewPrompts.userId, set: { status, snoozedUntil, updatedAt: now } });
}
