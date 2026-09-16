import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Db } from "./client";
import { promptVersions, suiteChecks, suiteResults, suiteRuns } from "./schema";

/**
 * Versions: a prompt's blok set, frozen, and the history that makes two runs comparable (EPIC-040).
 *
 * ## The three rules, and why they are not "one version per save"
 *
 * `docs/roadmap.md` asks for a version "on save and before run". Taken literally the first half is
 * unusable — `blok-editor.tsx` autosaves on a debounce, so a typed paragraph is a dozen saves, and a
 * dozen versions per paragraph is a history nobody reads. EPIC-041's entire value is that somebody
 * reads it.
 *
 * 1. **Unchanged content writes nothing.** `compiledHash` equal to the newest row's → return.
 * 2. **The open draft is rewritten in place.** While `pinnedAt` is null, the newest row absorbs
 *    further edits and keeps its `n`.
 * 3. **A run pins it.** `pinVersion` stamps `pinnedAt`, and the next save mints `n + 1`.
 *
 * One version per episode of editing between runs, with no timer, no background job and no quiet
 * window anybody has to defend. Confirmed by Soroush, 2026-09-16.
 *
 * ## Why this file does not take an `owner`
 *
 * Unlike `canvas.ts`, where the owner join *is* the access control, nothing here is reachable from a
 * route without a prompt that has already resolved for an owner. Callers pass a `promptId` they have
 * already proved they can reach. Adding an owner parameter that every caller satisfies by the same
 * prior check would look like a second gate while being the same one twice — and a gate that is
 * really an echo is worse than none, because it is trusted.
 */

/**
 * The compiled prompt's digest — **one field, not a key**.
 *
 * Deliberately not registered in `packages/core/src/key-collision.test.ts`'s `BUILDERS`: that gate is
 * about builders which join *several* fields, where a boundary can move and two different inputs
 * can produce one key. There is one input here and no separator, so there is no boundary to move.
 * The same digest `suite_runs.promptHash` records, so the two are comparable.
 */
export function compiledHashOf(compiledText: string): string {
  return createHash("sha256").update(compiledText).digest("hex");
}

/**
 * The digest of the **whole blok set** — the dedupe key, and not the same question as
 * `compiledHashOf`.
 *
 * ## Why the compiled hash cannot be the dedupe key (found by EPIC-041's drive, 2026-09-16)
 *
 * **An `expected` blok emits no text.** `compile/emits-text.ts` is explicit about it: an expected
 * blok becomes a *check*, and a prompt whose bloks are all expected compiles to `""` plus a list of
 * checks. So adding, editing or removing an expected blok leaves `compiledText` byte-identical —
 * and rule 1, comparing compiled hashes, concluded "nothing changed" and **wrote nothing at all.**
 *
 * Three consequences, and the first two are the reason this is a defect rather than a curiosity:
 *
 * 1. **Restore would silently drop the blok.** EPIC-041 writes a version's snapshot back onto the
 *    canvas; a snapshot that never recorded the expected blok restores a prompt without it. That is
 *    data loss through the one feature whose review line is "restore never deletes".
 * 2. **A/B would run with fewer checks than the prompt has.** EPIC-041 derives a comparison run's
 *    checks from the version's snapshot, so a run of that version verifies less than the person
 *    thinks and the surface says "nothing was verified" for a prompt full of rules.
 * 3. **`suite_runs.version` would name a version that does not describe what ran.** The run's own
 *    frozen `suite_checks` are right — they come from the live compile — but the version beside
 *    them would not be a faithful snapshot of the blok set that produced them.
 *
 * ## Why this digest and not a deep compare of the stored JSONB
 *
 * `jsonb` does not preserve key order, so `JSON.stringify(stored) === JSON.stringify(incoming)` is
 * not a reliable equality even for two identical snapshots. This never compares a round-tripped
 * value: the digest is computed on the way **in**, from the object `snapshot()` just built, whose
 * field order is fixed by that function, and afterwards only two hex strings are compared.
 *
 * **Null on a row written before this column existed**, and null never equals anything — so the
 * first save after this lands rewrites or mints rather than deduping against a key nobody recorded.
 * Wrong in the safe direction: an extra version, never a missing one.
 */
export function snapshotHashOf(snapshot: unknown): string {
  return createHash("sha256").update(JSON.stringify(snapshot) ?? "null").digest("hex");
}

export interface VersionRow {
  id: string;
  n: number;
  snapshot: unknown;
  compiledText: string;
  compiledHash: string;
  /** The dedupe key. Null on a row written before EPIC-041 added it — see `snapshotHashOf`. */
  snapshotHash: string | null;
  note: string | null;
  pinnedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** What `recordVersion` did, so a caller and a test can tell the three rules apart. */
export type RecordOutcome =
  | { kind: "unchanged"; id: string; n: number }
  | { kind: "updated"; id: string; n: number }
  | { kind: "minted"; id: string; n: number };

/** The newest version of a prompt — its open `Draft vN` when `pinnedAt` is null. */
export async function newestVersion(db: Db, promptId: string): Promise<VersionRow | undefined> {
  const [row] = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.prompt, promptId))
    .orderBy(desc(promptVersions.n))
    .limit(1);
  return row as VersionRow | undefined;
}

/**
 * Record the prompt's current blok set, following the three rules above.
 *
 * `snapshot` is core's `VersionSnapshot["bloks"]` and `compiledText` its compiled text; they come
 * from `snapshot()` together so they cannot disagree.
 */
export async function recordVersion(
  db: Db,
  promptId: string,
  version: { snapshot: unknown; compiledText: string },
): Promise<RecordOutcome> {
  const compiledHash = compiledHashOf(version.compiledText);
  const snapshotHash = snapshotHashOf(version.snapshot);
  const newest = await newestVersion(db, promptId);

  // Rule 1. Free, exact, and it removes most of the volume on its own: a debounce tick that lands on
  // text identical to the last one is the common case, not the exception.
  //
  // **Compared on the snapshot, not on the compiled text.** An expected blok emits no text, so a
  // compiled-text comparison calls a changed check set "unchanged" and writes nothing —
  // `snapshotHashOf` has the three things that then go wrong. Found by EPIC-041's drive.
  if (newest !== undefined && newest.snapshotHash !== null && newest.snapshotHash === snapshotHash) {
    return { kind: "unchanged", id: newest.id, n: newest.n };
  }

  // Rule 2. Same row, same `n`, new content.
  if (newest !== undefined && newest.pinnedAt === null) {
    await db
      .update(promptVersions)
      .set({
        snapshot: version.snapshot,
        compiledText: version.compiledText,
        compiledHash,
        snapshotHash,
        updatedAt: new Date(),
      })
      .where(and(eq(promptVersions.id, newest.id), isNull(promptVersions.pinnedAt)));
    return { kind: "updated", id: newest.id, n: newest.n };
  }

  // Rule 3.
  return mint(db, promptId, { ...version, compiledHash, snapshotHash }, (newest?.n ?? 0) + 1);
}

/**
 * Insert `Draft vN`, letting the unique index settle a race rather than a read-then-write.
 *
 * Two tabs saving at the same instant both read "the newest is pinned" and both compute the same
 * `n + 1`. One insert wins and the other violates `prompt_versions_prompt_n_idx`. **That is the
 * design, not a failure to avoid it**: EPIC-034's `claimPassedNotification` is the precedent — a
 * conditional write that the database arbitrates is correct always, where a check-then-insert is
 * correct only most of the time.
 *
 * The loser re-reads and tries once more, by which point the newest row is the winner's and rule 2
 * usually absorbs the edit. One retry, not a loop: a second collision means something other than a
 * race, and spinning on it would turn a bug into a hang.
 */
async function mint(
  db: Db,
  promptId: string,
  version: { snapshot: unknown; compiledText: string; compiledHash: string; snapshotHash: string },
  n: number,
  retry = true,
): Promise<RecordOutcome> {
  try {
    const [row] = await db
      .insert(promptVersions)
      .values({
        prompt: promptId,
        n,
        snapshot: version.snapshot,
        compiledText: version.compiledText,
        compiledHash: version.compiledHash,
        snapshotHash: version.snapshotHash,
      })
      .returning({ id: promptVersions.id, n: promptVersions.n });
    if (row === undefined) throw new Error("insert returned no row");
    return { kind: "minted", id: row.id, n: row.n };
  } catch (error) {
    if (!retry) throw error;
    const newest = await newestVersion(db, promptId);
    if (newest !== undefined && newest.snapshotHash !== null && newest.snapshotHash === version.snapshotHash) {
      return { kind: "unchanged", id: newest.id, n: newest.n };
    }
    if (newest !== undefined && newest.pinnedAt === null) {
      await db
        .update(promptVersions)
        .set({
          snapshot: version.snapshot,
          compiledText: version.compiledText,
          compiledHash: version.compiledHash,
          snapshotHash: version.snapshotHash,
          updatedAt: new Date(),
        })
        .where(and(eq(promptVersions.id, newest.id), isNull(promptVersions.pinnedAt)));
      return { kind: "updated", id: newest.id, n: newest.n };
    }
    return mint(db, promptId, version, (newest?.n ?? 0) + 1, false);
  }
}

/**
 * Pin the newest version, making it immutable, and return it.
 *
 * Called when something points at a version — today a run, later a publish. Idempotent: pinning an
 * already-pinned newest version returns it unchanged rather than minting a second one, because "run
 * this twice without editing" is an ordinary thing to do and it is the *same* version both times.
 *
 * Returns `undefined` only when the prompt has no versions at all, which a caller should treat as
 * "nothing to pin" rather than as an error — a prompt whose bloks have never been saved since
 * EPIC-040 shipped is in exactly that state.
 */
export async function pinVersion(db: Db, promptId: string): Promise<VersionRow | undefined> {
  const newest = await newestVersion(db, promptId);
  if (newest === undefined) return undefined;
  if (newest.pinnedAt !== null) return newest;

  const [pinned] = await db
    .update(promptVersions)
    .set({ pinnedAt: new Date() })
    .where(and(eq(promptVersions.id, newest.id), isNull(promptVersions.pinnedAt)))
    .returning();

  // A concurrent pin got there first. Its timestamp is as good as ours and the row is the same row.
  return (pinned as VersionRow | undefined) ?? (await newestVersion(db, promptId));
}

/** A prompt's versions, newest first. EPIC-041 renders this; EPIC-040 only proves it is right. */
export async function versionsForPrompt(db: Db, promptId: string, limit = 50): Promise<VersionRow[]> {
  const rows = await db
    .select()
    .from(promptVersions)
    .where(eq(promptVersions.prompt, promptId))
    .orderBy(desc(promptVersions.n))
    .limit(limit);
  return rows as VersionRow[];
}

/** How a version scored: the checks that passed, out of the ones that were actually graded. */
export interface VersionPassRate {
  versionId: string;
  /** `pass` results. */
  passed: number;
  /** `pass` + `fail`. **Excludes `not_graded`**, which is neither. */
  graded: number;
  /** Every result, `not_graded` included, so a caller can see how much was not gradable. */
  total: number;
  /** `passed / graded`, or null when nothing was graded — never 0, which would read as "all failed". */
  rate: number | null;
}

/**
 * Pass rate per version, from the **most recent finished run** of each.
 *
 * ## Derived, never stored, and that is a decision rather than a preference
 *
 * There is no `passRate` column on `prompt_versions`. The numbers already exist in `suite_results`,
 * and a column would be a second copy that can disagree with the first — at which point something
 * has to decide which is true, and that something is always written after the bug.
 *
 * EPIC-034's precedent is explicit and narrow: the one thing it stored rather than derived was
 * `passedNotifiedAt`, and the argument was that "we have already told PostHog" is a fact with **no
 * other home**. A pass rate has a home.
 *
 * ## `rate` is null, not zero, when nothing was graded
 *
 * EPIC-030's whole design is that `not_graded` is a third outcome and is never folded into a pass or
 * a fail. A version whose every check was ungradable scored nothing; reporting `0` would say it
 * failed, which is precisely the honesty EPIC-030 refused to trade away.
 */
export async function passRateForVersions(
  db: Db,
  versionIds: readonly string[],
): Promise<Map<string, VersionPassRate>> {
  const out = new Map<string, VersionPassRate>();
  if (versionIds.length === 0) return out;

  // The newest finished run per version. `distinct on` is Postgres's own answer to "one row per
  // group, chosen by an order" and does not need the window-function round trip.
  const latest = await db
    .selectDistinctOn([suiteRuns.version], { versionId: suiteRuns.version, runId: suiteRuns.id })
    .from(suiteRuns)
    .where(and(inArray(suiteRuns.version, [...versionIds]), eq(suiteRuns.state, "done")))
    .orderBy(suiteRuns.version, desc(suiteRuns.createdAt));

  const runIds = latest.map((row) => row.runId);
  if (runIds.length === 0) return out;

  const counts = await db
    .select({
      runId: suiteResults.suiteRun,
      outcome: suiteResults.outcome,
      n: sql<number>`count(*)::int`,
    })
    .from(suiteResults)
    .where(inArray(suiteResults.suiteRun, runIds))
    .groupBy(suiteResults.suiteRun, suiteResults.outcome);

  for (const row of latest) {
    if (row.versionId === null) continue;
    const mine = counts.filter((count) => count.runId === row.runId);
    const of = (outcome: string) => mine.find((count) => count.outcome === outcome)?.n ?? 0;
    const passed = of("pass");
    const graded = passed + of("fail");
    const total = mine.reduce((sum, count) => sum + count.n, 0);
    out.set(row.versionId, {
      versionId: row.versionId,
      passed,
      graded,
      total,
      rate: graded === 0 ? null : passed / graded,
    });
  }

  return out;
}

/** How many checks a version's most recent run had, for callers that need the denominator alone. */
export async function checkCountForRun(db: Db, suiteRunId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(suiteChecks)
    .where(eq(suiteChecks.suiteRun, suiteRunId));
  return row?.n ?? 0;
}

/** How long a note may be. Long enough for a sentence about why, short enough not to be a document. */
export const VERSION_NOTE_MAX = 280;

/**
 * Write a person's own words about a version (EPIC-041).
 *
 * **Allowed on a pinned version, deliberately.** `pinnedAt` freezes what the version *is* — its
 * bloks, its compiled text, its hash — because something points at it and history may not be
 * rewritten. A note is not that: it is somebody's sentence *about* the version, written after the
 * fact, and "why did I change this" is a question people answer later or never. Refusing to annotate
 * a version the moment it matters would make the field useless exactly when it is wanted.
 *
 * Trimmed of surrounding whitespace and stored verbatim otherwise; empty clears it back to null,
 * which is the same thing as never having written one.
 */
export async function setVersionNote(
  db: Db,
  promptId: string,
  versionId: string,
  note: string,
): Promise<void> {
  const trimmed = note.trim().slice(0, VERSION_NOTE_MAX);
  await db
    .update(promptVersions)
    .set({ note: trimmed === "" ? null : trimmed })
    .where(and(eq(promptVersions.id, versionId), eq(promptVersions.prompt, promptId)));
}
