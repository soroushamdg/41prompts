"use server";

import { sessions, users } from "@41prompts/db";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb } from "./db";

export async function signOutAction(): Promise<void> {
  await getAuth().api.signOut({ headers: await headers() });
  redirect("/sign-in");
}

// Soft delete (decision 5): sets `deletedAt` and kills every session for the account
// immediately. The *next* sign-in attempt is refused separately, by the
// `databaseHooks.session.create.before` hook in lib/auth.ts. The row itself is removed later,
// by the worker's daily purge job, once ACCOUNT_PURGE_WINDOW_DAYS has passed.
export async function deleteAccountAction(): Promise<void> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/sign-in");
  }

  const db = getDb();
  await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, session.user.id));
  await db.delete(sessions).where(eq(sessions.userId, session.user.id));
  redirect("/sign-in");
}
