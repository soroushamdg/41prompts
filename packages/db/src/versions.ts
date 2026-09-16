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

export interface VersionRow {
  id: string;
  n: number;
  snapshot: unknown;
  compiledText: string;
  compiledHash: string;
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
  const newest = await newestVersion(db, promptId);

  // Rule 1. Free, exact, and it removes most of the volume on its own: a debounce tick that lands on
  // text identical to the last one is the common case, not the exception.
  if (newest !== undefined && newest.compiledHash === compiledHash) {
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
        updatedAt: new Date(),
      })
      .where(and(eq(promptVersions.id, newest.id), isNull(promptVersions.pinnedAt)));
    return { kind: "updated", id: newest.id, n: newest.n };
  }

  // Rule 3.
  return mint(db, promptId, { ...version, compiledHash }, (newest?.n ?? 0) + 1);
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
  version: { snapshot: unknown; compiledText: string; compiledHash: string },
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
      })
      .returning({ id: promptVersions.id, n: promptVersions.n });
    if (row === undefined) throw new Error("insert returned no row");
    return { kind: "minted", id: row.id, n: row.n };
  } catch (error) {
    if (!retry) throw error;
    const newest = await newestVersion(db, promptId);
    if (newest !== undefined && newest.compiledHash === version.compiledHash) {
      return { kind: "unchanged", id: newest.id, n: newest.n };
    }
    if (newest !== undefined && newest.pinnedAt === null) {
      await db
        .update(promptVersions)
        .set({
          snapshot: version.snapshot,
          compiledText: version.compiledText,
          compiledHash: version.compiledHash,
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
