"use server";
import { cookies } from "next/headers";
import { db } from "@/db";
import { deleteAccount, type DeletedCounts } from "@/server/account";
import { cancelSubscriptionFor } from "@/server/billing";
import { currentUserId } from "@/server/session";

/** M10: typing DELETE removes the account, every prompt, version and key. */
export async function deleteAccountAction(confirm: string): Promise<({ ok: true } & DeletedCounts) | { ok: false; error: string }> {
  const userId = await currentUserId();
  if (!userId) return { ok: false, error: "Your session ended. Sign in again." };
  if (confirm !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  try {
    await cancelSubscriptionFor(db, userId);
  } catch {
    return { ok: false, error: "Your Stripe subscription could not be cancelled, so nothing was deleted. Try again, or cancel it in the billing portal first." };
  }
  const counts = await deleteAccount(db, userId);
  const jar = await cookies();
  for (const c of jar.getAll()) if (c.name.includes("better-auth")) jar.delete(c.name);
  return { ok: true, ...counts };
}
