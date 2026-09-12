import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { bloks, projects, prompts } from "./schema";
import { needsRebalance, rankBetween, rankSequence } from "./rank";

/**
 * Owner-scoped reads and writes for the canvas.
 *
 * **Every function here takes an `owner` and there is no variant that does not** (EPIC-021a decision
 * 3). A prompt is reachable only through its project and a project only through its owner, so the
 * join is the access control — not a check somebody remembers to write in a route. The one way to
 * read a blok is through a prompt that resolved for this owner.
 *
 * A miss returns `undefined`, and the route turns that into **404, not 403**. A 403 confirms the id
 * exists, which is a disclosure on its own: it tells a stranger which prompt ids are real.
 */

export interface BlokRow {
  id: string;
  kind: string;
  text: string;
  rank: string;
  editedText: string | null;
  editedFromHash: string | null;
}

/**
 * Rank comparison is pinned to `COLLATE "C"` — byte order — at every site that orders or compares a
 * rank.
 *
 * Without it Postgres uses the database's collation, and a locale-aware collation can treat `a` and
 * `A` as equal or order punctuation differently from JavaScript's `<`. The canvas would then order
 * one way in the browser and another in the database, which surfaces as cards silently swapping on
 * reload. `rank.ts`'s alphabet is chosen so byte order and JavaScript order agree; this is the other
 * half of that promise.
 */
const RANK_ORDER = sql`${bloks.rank} COLLATE "C"`;

/** The prompt, if this owner can reach it. `undefined` otherwise — never a partial row, never a throw. */
export async function promptForOwner(
  db: Db,
  promptId: string,
  owner: string
): Promise<{ id: string; name: string; project: string } | undefined> {
  const [row] = await db
    .select({ id: prompts.id, name: prompts.name, project: prompts.project })
    .from(prompts)
    .innerJoin(projects, eq(prompts.project, projects.id))
    .where(
      and(
        eq(prompts.id, promptId),
        eq(projects.owner, owner),
        isNull(prompts.deletedAt),
        isNull(projects.deletedAt)
      )
    )
    .limit(1);
  return row;
}

/** This prompt's live bloks in rank order. The caller has already proved ownership. */
export async function bloksForPrompt(db: Db, promptId: string): Promise<BlokRow[]> {
  return db
    .select({
      id: bloks.id,
      kind: bloks.kind,
      text: bloks.text,
      rank: bloks.rank,
      editedText: bloks.editedText,
      editedFromHash: bloks.editedFromHash,
    })
    .from(bloks)
    .where(and(eq(bloks.prompt, promptId), isNull(bloks.deletedAt)))
    .orderBy(asc(RANK_ORDER));
}

/**
 * Add a blok at the end, or between two existing ones.
 *
 * **This is the write EPIC-021a decision 5 is about, and it is one INSERT.** It writes to no other
 * row, so no other blok's `editedText` can be lost by it — the guarantee is structural rather than a
 * rule this function has to remember. If this ever becomes a read-modify-write over the whole prompt,
 * that is the moment the silent failure becomes possible again.
 */
export async function addBlok(
  db: Db,
  promptId: string,
  blok: { kind: string; text: string; id?: string },
  between: { before: string | null; after: string | null } = { before: null, after: null }
): Promise<BlokRow> {
  const rank =
    between.before === null && between.after === null
      ? rankBetween(await lastRank(db, promptId), null)
      : rankBetween(between.before, between.after);

  const [row] = await db
    .insert(bloks)
    .values({ ...(blok.id === undefined ? {} : { id: blok.id }), prompt: promptId, kind: blok.kind, text: blok.text, rank })
    .returning({
      id: bloks.id,
      kind: bloks.kind,
      text: bloks.text,
      rank: bloks.rank,
      editedText: bloks.editedText,
      editedFromHash: bloks.editedFromHash,
    });
  return row!;
}

async function lastRank(db: Db, promptId: string): Promise<string | null> {
  const [row] = await db
    .select({ rank: bloks.rank })
    .from(bloks)
    .where(and(eq(bloks.prompt, promptId), isNull(bloks.deletedAt)))
    .orderBy(sql`${bloks.rank} COLLATE "C" DESC`)
    .limit(1);
  return row?.rank ?? null;
}

/** Autosave. One row, and `text` goes in exactly as given — no trim, no normalisation. */
export async function setBlokText(db: Db, promptId: string, blokId: string, text: string): Promise<void> {
  await db
    .update(bloks)
    .set({ text, updatedAt: new Date() })
    .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));
}

/**
 * Record a span somebody wrote themselves, with the blok hash they were looking at.
 *
 * EPIC-021b builds the pane that calls this. It lives here now because decision 5's guarantee is
 * about what *other* writes do to this column, and a guarantee about a column nothing can write is
 * not a guarantee — the named test needs a real hand edit to survive.
 */
export async function setHandEdit(
  db: Db,
  promptId: string,
  blokId: string,
  edit: { text: string; fromHash: string } | null
): Promise<void> {
  await db
    .update(bloks)
    .set({
      editedText: edit?.text ?? null,
      editedFromHash: edit?.fromHash ?? null,
      updatedAt: new Date(),
    })
    .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));
}

/**
 * Move one blok between two others. **One row** — the criterion.
 *
 * Returns `"rebalanced"` when the keys had grown past `RANK_MAX_LENGTH` and the prompt's ranks were
 * rewritten instead. That is the only path here that writes more than one row, it runs in a
 * transaction, and it is O(bloks).
 */
export async function moveBlok(
  db: Db,
  promptId: string,
  blokId: string,
  between: { before: string | null; after: string | null }
): Promise<"moved" | "rebalanced"> {
  const rank = rankBetween(between.before, between.after);

  if (!needsRebalance([rank])) {
    await db
      .update(bloks)
      .set({ rank, updatedAt: new Date() })
      .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));
    return "moved";
  }

  // The rebalance. Place the moved blok where it was asked to go, then rewrite every key evenly.
  await db.transaction(async (tx) => {
    await tx
      .update(bloks)
      .set({ rank, updatedAt: new Date() })
      .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));

    const rows = await tx
      .select({ id: bloks.id })
      .from(bloks)
      .where(and(eq(bloks.prompt, promptId), isNull(bloks.deletedAt)))
      .orderBy(asc(RANK_ORDER));

    const fresh = rankSequence(rows.length);
    for (const [i, row] of rows.entries()) {
      await tx.update(bloks).set({ rank: fresh[i]! }).where(eq(bloks.id, row.id));
    }
  });
  return "rebalanced";
}

/** Soft delete, so decision 8's undo is clearing a column rather than rebuilding a row from memory. */
export async function deleteBlok(db: Db, promptId: string, blokId: string): Promise<void> {
  await db
    .update(bloks)
    .set({ deletedAt: new Date() })
    .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));
}

/** Undo. Restores the text, the rank and the hand edit together, because all three were the blok. */
export async function restoreBlok(db: Db, promptId: string, blokId: string): Promise<void> {
  await db
    .update(bloks)
    .set({ deletedAt: null })
    .where(and(eq(bloks.id, blokId), eq(bloks.prompt, promptId)));
}
