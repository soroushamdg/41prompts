import "server-only";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { user as userTable } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { Plan } from "@/lib/plans";

export const getSession = cache(async () => auth.api.getSession({ headers: await headers() }));

export type Viewer = { id: string; name: string; email: string; image: string | null; plan: Plan; createdAt: Date };

/** The signed-in user with server-only fields read from the database (never
    from a cached session), or a redirect to sign-in. */
export const requireViewer = cache(async (next?: string): Promise<Viewer> => {
  const session = await getSession();
  if (!session) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  const [row] = await db
    .select({ id: userTable.id, name: userTable.name, email: userTable.email, image: userTable.image, plan: userTable.plan, createdAt: userTable.createdAt })
    .from(userTable)
    .where(eq(userTable.id, session.user.id));
  if (!row) redirect("/sign-in");
  return row;
});

/** For route handlers and server actions: the user ID or null (no redirect). */
export async function currentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user.id ?? null;
}
