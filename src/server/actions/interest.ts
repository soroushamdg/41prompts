"use server";
import { db } from "@/db";
import { recordInterest } from "@/server/interest";
import { currentUserId } from "@/server/session";

/** "Tell me when it opens" on the upgrade sheet. */
export async function registerInterestAction(feature: string): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId || typeof feature !== "string" || !feature.trim()) return false;
  await recordInterest(db, userId, feature.trim());
  return true;
}
