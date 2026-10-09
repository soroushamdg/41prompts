import "server-only";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { account, modelConnections, prompts, promptVersions, user } from "@/db/schema";
import type { ExportPrompt } from "@/lib/export";

/* Data and privacy (M09, M10): export pages and account deletion. */

export const EXPORT_PAGE = 10;

export async function exportPage(db: Db, userId: string, offset: number): Promise<{ total: number; versions: number; prompts: ExportPrompt[] }> {
  const [totals] = await db
    .select({ total: count(), versions: sql<number>`coalesce(sum(${prompts.headVersion}), 0)::int` })
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt)));
  const page = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt)))
    .orderBy(asc(prompts.sheetNumber))
    .limit(EXPORT_PAGE)
    .offset(offset);
  const ids = page.map((p) => p.id);
  const versions = ids.length
    ? await db.select().from(promptVersions).where(inArray(promptVersions.promptId, ids)).orderBy(asc(promptVersions.promptId), sql`${promptVersions.number} desc`)
    : [];
  return {
    total: totals?.total ?? 0,
    versions: totals?.versions ?? 0,
    prompts: page.map((p) => ({
      slug: p.slug,
      sheetNumber: p.sheetNumber,
      archived: p.archivedAt !== null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      fillValues: p.fillValues,
      versions: versions
        .filter((v) => v.promptId === p.id)
        .map((v) => ({ number: v.number, note: v.note, name: v.name, createdAt: v.createdAt.toISOString(), bloks: v.bloks })),
    })),
  };
}

export async function signInMethods(db: Db, userId: string): Promise<string[]> {
  const rows = await db.select({ provider: account.providerId }).from(account).where(eq(account.userId, userId));
  const names: Record<string, string> = { google: "Google", github: "GitHub" };
  return ["an email link", ...rows.map((r) => names[r.provider]).filter((x): x is string => Boolean(x))];
}

export type DeletedCounts = { prompts: number; versions: number; models: number };

/** Deletes the user; prompts, versions, models, sessions and accounts cascade. */
export async function deleteAccount(db: Db, userId: string): Promise<DeletedCounts> {
  return db.transaction(async (tx) => {
    const [p] = await tx.select({ n: count(), v: sql<number>`coalesce(sum(${prompts.headVersion}), 0)::int` }).from(prompts).where(eq(prompts.userId, userId));
    const [m] = await tx.select({ n: count() }).from(modelConnections).where(eq(modelConnections.userId, userId));
    await tx.delete(user).where(eq(user.id, userId));
    return { prompts: p?.n ?? 0, versions: p?.v ?? 0, models: m?.n ?? 0 };
  });
}
