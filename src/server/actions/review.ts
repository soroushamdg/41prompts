"use server";
import { z } from "zod";
import { db } from "@/db";
import { recordReviewAsked, setReviewStatus } from "@/server/review";
import { currentUserId } from "@/server/session";

const Stage = z.enum(["run_completed", "tenth_version", "fifth_copy", "returning"]);

export async function reviewAskedAction(stage: string): Promise<void> {
  const userId = await currentUserId();
  const s = Stage.safeParse(stage);
  if (userId && s.success) await recordReviewAsked(db, userId, s.data);
}

export async function reviewAnswerAction(answer: "later" | "never" | "reviewed"): Promise<void> {
  const userId = await currentUserId();
  if (!userId || !["later", "never", "reviewed"].includes(answer)) return;
  await setReviewStatus(db, userId, answer === "later" ? "snoozed" : answer);
}
