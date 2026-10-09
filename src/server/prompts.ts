import "server-only";
import { and, desc, eq, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { prompts, promptVersions, user } from "@/db/schema";
import type { Blok } from "@/lib/bloks";
import { nextFreeSlug, slugify } from "@/lib/slug";
import { describeBloks, maxBlokNumber } from "@/lib/versions";
import { contentHash } from "./hash";

/* Prompts and their versions. Every function is scoped to one user; nothing
   here trusts an ID from the client without the user check. Versions are only
   ever inserted; restoring one inserts a copy as the new head. */

export type PromptRow = typeof prompts.$inferSelect;

export type LibraryItem = {
  id: string;
  slug: string;
  description: string;
  bloksCount: number;
  versions: number;
  sheetNumber: number;
  updatedAt: string;
  archived: boolean;
};

export class SlugTaken extends Error {
  constructor(public slug: string) {
    super(`A prompt named ${slug} already exists.`);
  }
}

function toItem(p: Pick<PromptRow, "id" | "slug" | "description" | "bloksCount" | "headVersion" | "sheetNumber" | "updatedAt" | "archivedAt">): LibraryItem {
  return {
    id: p.id,
    slug: p.slug,
    description: p.description,
    bloksCount: p.bloksCount,
    versions: p.headVersion,
    sheetNumber: p.sheetNumber,
    updatedAt: p.updatedAt.toISOString(),
    archived: p.archivedAt !== null,
  };
}

async function takenSlugs(db: Db, userId: string, base: string): Promise<Set<string>> {
  const rows = await db
    .select({ slug: prompts.slug })
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt), sql`(${prompts.slug} = ${base} or ${prompts.slug} like ${base.replace(/[\\%_]/g, (c) => "\\" + c) + "-%"})`));
  return new Set(rows.map((r) => r.slug));
}

export async function freeSlug(db: Db, userId: string, wanted: string): Promise<string> {
  const base = slugify(wanted);
  return nextFreeSlug(base, await takenSlugs(db, userId, base));
}

/** Creates a prompt with its first version. */
export async function createPrompt(db: Db, userId: string, input: { name: string; bloks: Blok[]; note: string }): Promise<LibraryItem> {
  return db.transaction(async (tx) => {
    const [counter] = await tx
      .update(user)
      .set({ nextSheetNumber: sql`${user.nextSheetNumber} + 1` })
      .where(eq(user.id, userId))
      .returning({ sheet: sql<number>`${user.nextSheetNumber} - 1` });
    if (!counter) throw new Error("Unknown user.");
    const slug = await freeSlug(tx as unknown as Db, userId, input.name);
    const [p] = await tx
      .insert(prompts)
      .values({
        userId,
        slug,
        sheetNumber: counter.sheet,
        headVersion: 1,
        bloksCount: input.bloks.length,
        description: describeBloks(input.bloks),
        nextBlokId: maxBlokNumber(input.bloks) + 1,
      })
      .returning();
    await tx.insert(promptVersions).values({ promptId: p!.id, number: 1, bloks: input.bloks, contentHash: contentHash(input.bloks), note: input.note });
    return toItem(p!);
  });
}

export async function listPrompts(db: Db, userId: string): Promise<LibraryItem[]> {
  const rows = await db
    .select()
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt)))
    .orderBy(desc(prompts.updatedAt));
  return rows.map(toItem);
}

export async function getPromptBySlug(db: Db, userId: string, slug: string): Promise<PromptRow | null> {
  const [p] = await db.select().from(prompts).where(and(eq(prompts.userId, userId), eq(prompts.slug, slug), isNull(prompts.deletedAt)));
  return p ?? null;
}

export async function getOwnedPrompt(db: Db, userId: string, id: string): Promise<PromptRow | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [p] = await db.select().from(prompts).where(and(eq(prompts.userId, userId), eq(prompts.id, id), isNull(prompts.deletedAt)));
  return p ?? null;
}

export async function headBloks(db: Db, promptId: string, head: number): Promise<Blok[]> {
  const [v] = await db
    .select({ bloks: promptVersions.bloks })
    .from(promptVersions)
    .where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.number, head)));
  return v?.bloks ?? [];
}

/** Renames (re-slugs) a prompt. A name another live prompt has is refused. */
export async function renamePrompt(db: Db, userId: string, id: string, name: string): Promise<string> {
  const p = await getOwnedPrompt(db, userId, id);
  if (!p) throw new Error("Not found.");
  const slug = slugify(name, p.slug);
  if (slug === p.slug) return slug;
  const clash = await getPromptBySlug(db, userId, slug);
  if (clash) throw new SlugTaken(slug);
  await db.update(prompts).set({ slug }).where(and(eq(prompts.id, id), eq(prompts.userId, userId)));
  return slug;
}

/** Copies the head version into a new prompt named "<name>-copy". */
export async function duplicatePrompt(db: Db, userId: string, id: string): Promise<LibraryItem> {
  const p = await getOwnedPrompt(db, userId, id);
  if (!p) throw new Error("Not found.");
  const bloks = await headBloks(db, p.id, p.headVersion);
  return createPrompt(db, userId, { name: `${p.slug.slice(0, 55)}-copy`, bloks, note: `Duplicated from ${p.slug} v${p.headVersion}` });
}

export async function setArchived(db: Db, userId: string, id: string, archived: boolean): Promise<void> {
  await db
    .update(prompts)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(prompts.id, id), eq(prompts.userId, userId), isNull(prompts.deletedAt)));
}

/** Soft delete, so Undo can bring it back; the daily purge removes it for good. */
export async function softDelete(db: Db, userId: string, id: string): Promise<void> {
  await db.update(prompts).set({ deletedAt: new Date() }).where(and(eq(prompts.id, id), eq(prompts.userId, userId), isNull(prompts.deletedAt)));
}

/** Undo a delete. If the name was taken meanwhile, it comes back as name-2. */
export async function undoDelete(db: Db, userId: string, id: string): Promise<LibraryItem | null> {
  const [p] = await db.select().from(prompts).where(and(eq(prompts.id, id), eq(prompts.userId, userId), isNotNull(prompts.deletedAt)));
  if (!p) return null;
  const slug = await freeSlug(db, userId, p.slug);
  const [back] = await db.update(prompts).set({ deletedAt: null, slug }).where(eq(prompts.id, id)).returning();
  return back ? toItem(back) : null;
}

/** Hard-deletes prompts soft-deleted before the cutoff (versions cascade). */
export async function purgeDeleted(db: Db, cutoff: Date): Promise<number> {
  const gone = await db.delete(prompts).where(and(isNotNull(prompts.deletedAt), lt(prompts.deletedAt, cutoff))).returning({ id: prompts.id });
  return gone.length;
}

export async function versionCounts(db: Db, userId: string): Promise<{ prompts: number; versions: number }> {
  const [row] = await db
    .select({ prompts: sql<number>`count(*)::int`, versions: sql<number>`coalesce(sum(${prompts.headVersion}), 0)::int` })
    .from(prompts)
    .where(and(eq(prompts.userId, userId), isNull(prompts.deletedAt)));
  return row ?? { prompts: 0, versions: 0 };
}


