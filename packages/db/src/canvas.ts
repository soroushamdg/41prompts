import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db, DbOrTx } from "./client";
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
  db: DbOrTx,
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

async function lastRank(db: DbOrTx, promptId: string): Promise<string | null> {
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

/**
 * One blok as a stored snapshot records it (`packages/core`'s `SnapshotBlok`).
 *
 * **Declared here rather than imported.** `packages/db` does not depend on `@41prompts/core` and
 * EPIC-040 decided that deliberately: the seam where the two meet is `apps/web`, and pulling the
 * compiler into the database package to describe six fields would couple every versions test to it.
 * The caller has already parsed the JSONB with core's `readSnapshotBloks`, which is the one place
 * that decides what a snapshot looks like; this is the shape it hands over.
 */
export interface SnapshotBlokRow {
  readonly id: string;
  readonly kind: string;
  readonly text: string;
  readonly position: number;
  readonly editedText: string | null;
  readonly editedFromHash: string | null;
}

/**
 * A snapshot named a blok that is another prompt's row. The restore is refused, whole.
 *
 * Named rather than a bare `Error` so a caller can tell this apart from a lost connection and say
 * something true to the person, instead of turning every failure into one sentence.
 */
export class BlokBelongsElsewhereError extends Error {
  constructor(readonly blokIds: readonly string[]) {
    super(`these bloks belong to another prompt: ${blokIds.join(", ")}`);
    this.name = "BlokBelongsElsewhereError";
  }
}

/**
 * Put a snapshot's blok set back on the canvas (EPIC-041's restore).
 *
 * ## It never deletes a row, and that is the roadmap's Review line
 *
 * *"Restore never deletes."* A blok the restored version did not have is **soft-deleted** — the same
 * door `deleteBlok` uses, so Undo is still clearing a column — and a blok the restored version had
 * is brought back **by its own id**, whether it is live or was soft-deleted since.
 *
 * Coming back by id rather than as a fresh row is not tidiness: a blok's id is what `diff()` matches
 * on, and re-inserting the same text under a new id would make every future diff report a removal
 * and an addition where a person restored something. The whole reason `diff` can tell a move from a
 * rewrite is that identity survives, and a restore that minted new ids would be the one operation
 * that breaks it.
 *
 * ## Deleted rows are read too
 *
 * `bloksForPrompt` filters them out because a canvas does not show them. This does not, because a
 * restore is precisely the operation that may need one back.
 *
 * ## Ranks are rewritten wholesale
 *
 * The snapshot's order is total and contiguous, so there is nothing to interleave between: every
 * restored blok gets a fresh key from `rankSequence`, the same call a rebalance makes. Threading new
 * keys between existing ones would be work in service of preserving keys that no longer describe
 * anything.
 *
 * ## It refuses rather than half-applying, and `BlokBelongsElsewhereError` is why
 *
 * `bloks.id` is a **global** primary key, not one scoped per prompt. So a snapshot naming an id that
 * belongs to a different prompt cannot be applied: inserting it violates `bloks_pkey`, and the two
 * alternatives are worse than refusing. Minting a fresh id would silently break identity, which is
 * the one property `diff()` depends on. Skipping the blok would produce a prompt the person never
 * had, quietly, which is the failure a restore exists to prevent.
 *
 * It cannot happen with minted ids, which are random. It can with the decompiler's content-derived
 * `blok_` ones (`ids.ts`), where two prompts carrying identical text would carry identical ids — no
 * import path mints those into `bloks` today, and this is the guard for the day one does.
 *
 * One transaction. A half-applied restore is somebody's canvas in a state they never had.
 */
export async function applySnapshot(
  db: Db,
  promptId: string,
  snapshotBloks: readonly SnapshotBlokRow[],
): Promise<{ restored: number; removed: number }> {
  const ordered = [...snapshotBloks].sort((left, right) => left.position - right.position);
  const ranks = rankSequence(ordered.length);
  const wanted = new Set(ordered.map((blok) => blok.id));

  return db.transaction(async (tx) => {
    // Deleted rows included — see above. This is the one read in the package that wants them.
    const existing = await tx
      .select({ id: bloks.id })
      .from(bloks)
      .where(eq(bloks.prompt, promptId));
    const present = new Set(existing.map((row) => row.id));

    // Checked before anything is written, so the failure is one named error rather than a
    // `bloks_pkey` violation surfacing from whichever insert happened to be first.
    const strangers =
      wanted.size === 0
        ? []
        : (
            await tx
              .select({ id: bloks.id, prompt: bloks.prompt })
              .from(bloks)
              .where(inArray(bloks.id, [...wanted]))
          ).filter((row) => row.prompt !== promptId);
    if (strangers.length > 0) {
      throw new BlokBelongsElsewhereError(strangers.map((row) => row.id));
    }

    for (const [index, blok] of ordered.entries()) {
      const values = {
        kind: blok.kind,
        text: blok.text,
        rank: ranks[index]!,
        editedText: blok.editedText,
        editedFromHash: blok.editedFromHash,
        deletedAt: null,
        updatedAt: new Date(),
      };

      if (present.has(blok.id)) {
        await tx
          .update(bloks)
          .set(values)
          .where(and(eq(bloks.id, blok.id), eq(bloks.prompt, promptId)));
      } else {
        // The row is gone entirely. Keep the id: identity is what makes a later diff readable, and
        // the guard above has already proved this id is not another prompt's.
        await tx.insert(bloks).values({ id: blok.id, prompt: promptId, ...values });
      }
    }

    const removed = existing.filter((row) => !wanted.has(row.id));
    for (const row of removed) {
      // Soft, always. `deletedAt` is already set on some of these and setting it again is harmless;
      // what matters is that nothing here is a `DELETE`.
      await tx
        .update(bloks)
        .set({ deletedAt: new Date() })
        .where(and(eq(bloks.id, row.id), eq(bloks.prompt, promptId), isNull(bloks.deletedAt)));
    }

    return { restored: ordered.length, removed: removed.length };
  });
}
