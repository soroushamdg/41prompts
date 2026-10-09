import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db";
import { prompts, promptVersions } from "@/db/schema";
import { BLOK_ID, BLOK_TYPES, MAX_BLOKS, MAX_PROMPT_CHARS, type Blok } from "@/lib/bloks";
import { describeBloks, describeChange, maxBlokNumber } from "@/lib/versions";
import { contentHash } from "./hash";

/* Autosave and history (M05). Every save inserts an immutable version row;
   nothing is ever overwritten. Saves for one prompt are serialised with a
   row lock, retries are idempotent by clientSaveId, and a snapshot identical
   to the head creates nothing. */

export type VersionMeta = { number: number; note: string; name: string | null; createdAt: string };

export const BloksSchema = z
  .array(z.object({ id: z.string().regex(BLOK_ID), type: z.enum(BLOK_TYPES), text: z.string() }))
  .max(MAX_BLOKS)
  .refine((bs) => new Set(bs.map((b) => b.id)).size === bs.length, "Blok IDs must be unique.")
  .refine((bs) => bs.reduce((n, b) => n + b.text.length, 0) <= MAX_PROMPT_CHARS + 2_000, "That prompt is over about 100 KB.");

export const SaveSchema = z.object({
  bloks: BloksSchema,
  baseVersion: z.number().int().min(0),
  clientSaveId: z.string().min(8).max(64).regex(/^[A-Za-z0-9_-]+$/),
});

export type SaveResult = { version: VersionMeta; created: boolean; conflict: boolean };

const meta = (v: typeof promptVersions.$inferSelect): VersionMeta => ({ number: v.number, note: v.note, name: v.name, createdAt: v.createdAt.toISOString() });

async function lockPrompt(tx: Db, userId: string, promptId: string) {
  const [p] = await tx
    .select()
    .from(prompts)
    .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)))
    .for("update");
  return p ?? null;
}

async function insertHead(tx: Db, p: typeof prompts.$inferSelect, bloks: Blok[], note: string, clientSaveId: string | null) {
  const number = p.headVersion + 1;
  const [v] = await tx.insert(promptVersions).values({ promptId: p.id, number, bloks, contentHash: contentHash(bloks), clientSaveId, note }).returning();
  await tx
    .update(prompts)
    .set({
      headVersion: number,
      bloksCount: bloks.length,
      description: describeBloks(bloks),
      nextBlokId: Math.max(p.nextBlokId, maxBlokNumber(bloks) + 1),
      updatedAt: new Date(),
    })
    .where(eq(prompts.id, p.id));
  return v!;
}

/** Autosave: one call, at most one new version. */
export async function saveVersion(db: Db, userId: string, promptId: string, input: z.infer<typeof SaveSchema>): Promise<SaveResult | null> {
  return db.transaction(async (tx) => {
    const p = await lockPrompt(tx as unknown as Db, userId, promptId);
    if (!p) return null;
    const [retry] = await tx.select().from(promptVersions).where(and(eq(promptVersions.promptId, p.id), eq(promptVersions.clientSaveId, input.clientSaveId)));
    if (retry) return { version: meta(retry), created: false, conflict: false };
    const [head] = await tx.select().from(promptVersions).where(and(eq(promptVersions.promptId, p.id), eq(promptVersions.number, p.headVersion)));
    const conflict = input.baseVersion !== p.headVersion;
    if (head && head.contentHash === contentHash(input.bloks)) return { version: meta(head), created: false, conflict };
    const note = describeChange(head?.bloks ?? [], input.bloks);
    const v = await insertHead(tx as unknown as Db, p, input.bloks, note, input.clientSaveId);
    return { version: meta(v), created: true, conflict };
  });
}

/** Restoring creates a new version with the old bloks; nothing is overwritten. */
export async function restoreVersion(db: Db, userId: string, promptId: string, number: number): Promise<{ version: VersionMeta; bloks: Blok[] } | null> {
  return db.transaction(async (tx) => {
    const p = await lockPrompt(tx as unknown as Db, userId, promptId);
    if (!p) return null;
    const [old] = await tx.select().from(promptVersions).where(and(eq(promptVersions.promptId, p.id), eq(promptVersions.number, number)));
    if (!old) return null;
    const v = await insertHead(tx as unknown as Db, p, old.bloks, `Restored v${number}`, null);
    return { version: meta(v), bloks: old.bloks };
  });
}

export async function listVersions(db: Db, promptId: string): Promise<VersionMeta[]> {
  const rows = await db
    .select({ number: promptVersions.number, note: promptVersions.note, name: promptVersions.name, createdAt: promptVersions.createdAt })
    .from(promptVersions)
    .where(eq(promptVersions.promptId, promptId))
    .orderBy(desc(promptVersions.number));
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

export async function getVersionBloks(db: Db, userId: string, promptId: string, number: number): Promise<Blok[] | null> {
  const [row] = await db
    .select({ bloks: promptVersions.bloks })
    .from(promptVersions)
    .innerJoin(prompts, eq(prompts.id, promptVersions.promptId))
    .where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt), eq(promptVersions.number, number)));
  return row?.bloks ?? null;
}

/** Names a version ("works on Claude"). The only change a version row ever gets. */
export async function nameVersion(db: Db, userId: string, promptId: string, number: number, name: string): Promise<boolean> {
  const p = await db.select({ id: prompts.id }).from(prompts).where(and(eq(prompts.id, promptId), eq(prompts.userId, userId), isNull(prompts.deletedAt)));
  if (!p.length) return false;
  const clean = name.trim().slice(0, 60) || null;
  const done = await db.update(promptVersions).set({ name: clean }).where(and(eq(promptVersions.promptId, promptId), eq(promptVersions.number, number))).returning({ n: promptVersions.number });
  return done.length > 0;
}

export async function saveFillValues(db: Db, userId: string, promptId: string, values: Record<string, string>): Promise<void> {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(values).slice(0, 100)) if (/^[A-Za-z0-9_]{1,80}$/.test(k)) clean[k] = String(v).slice(0, 5_000);
  await db.update(prompts).set({ fillValues: clean }).where(and(eq(prompts.id, promptId), eq(prompts.userId, userId)));
}
