"use server";
import { z } from "zod";
import { db } from "@/db";
import { PROVIDERS } from "@/db/schema";
import { type KeySummary, readKey, removeKey, saveKey } from "@/server/keys";
import { checkKey } from "@/server/provider-check";
import { currentUserId } from "@/server/session";

/* Keys never come back to the browser after saving. These actions never log
   their arguments, and Sentry scrubs anything key-shaped. */

const Provider = z.enum(PROVIDERS);
const Key = z.string().trim().min(8).max(400).regex(/^\S+$/);

type Fail = { ok: false; error: string };

export async function saveKeyAction(provider: string, apiKey: string): Promise<({ ok: true; ms: number } & KeySummary) | Fail> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  const p = Provider.safeParse(provider);
  const k = Key.safeParse(apiKey);
  if (!p.success || !k.success) return { ok: false, error: "That does not look like an API key." };
  const check = await checkKey(p.data, k.data);
  if (!check.ok && check.reason !== "rate") return { ok: false, error: check.message };
  const saved = await saveKey(db, userId, p.data, k.data);
  return { ok: true, ms: check.ok ? check.ms : 0, ...saved };
}

export async function testKeyAction(provider: string): Promise<{ ok: true; ms: number } | Fail> {
  const userId = await currentUserId();
  const p = Provider.safeParse(provider);
  if (!userId || !p.success) return { ok: false, error: "Not found." };
  const key = await readKey(db, userId, p.data);
  if (!key) return { ok: false, error: "No key saved for this provider." };
  const check = await checkKey(p.data, key);
  return check.ok ? check : { ok: false, error: check.message };
}

export async function removeKeyAction(provider: string): Promise<{ ok: boolean }> {
  const userId = await currentUserId();
  const p = Provider.safeParse(provider);
  if (!userId || !p.success) return { ok: false };
  await removeKey(db, userId, p.data);
  return { ok: true };
}
