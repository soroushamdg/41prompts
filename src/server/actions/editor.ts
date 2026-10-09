"use server";
import { z } from "zod";
import { db } from "@/db";
import type { Blok } from "@/lib/bloks";
import { currentUserId } from "@/server/session";
import { getVersionBloks, nameVersion, restoreVersion, saveFillValues, type VersionMeta } from "@/server/versions";

const Id = z.string().uuid();
const Num = z.number().int().positive();

export async function restoreVersionAction(promptId: string, number: number): Promise<{ ok: true; version: VersionMeta; bloks: Blok[] } | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(promptId).success || !Num.safeParse(number).success) return { ok: false, error: "Not found." };
  const r = await restoreVersion(db, userId, promptId, number);
  return r ? { ok: true, ...r } : { ok: false, error: "That version could not be restored." };
}

export async function getVersionAction(promptId: string, number: number): Promise<Blok[] | null> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(promptId).success || !Num.safeParse(number).success) return null;
  return getVersionBloks(db, userId, promptId, number);
}

export async function nameVersionAction(promptId: string, number: number, name: string): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(promptId).success || !Num.safeParse(number).success || typeof name !== "string") return false;
  return nameVersion(db, userId, promptId, number, name);
}

export async function saveFillValuesAction(promptId: string, values: Record<string, string>): Promise<boolean> {
  const userId = await currentUserId();
  if (!userId || !Id.safeParse(promptId).success || typeof values !== "object" || !values) return false;
  await saveFillValues(db, userId, promptId, values);
  return true;
}
