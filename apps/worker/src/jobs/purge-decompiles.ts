import { DECOMPILE_RETENTION_DAYS, decompileRuns, decompiles, type Db, RUN_COUNT_RETENTION_DAYS } from "@41prompts/db";
import { lt } from "drizzle-orm";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

/**
 * Delete every anonymous decompile past the retention window.
 *
 * **A hard delete, not a soft one** (EPIC-014 decision 3). The page tells a stranger their paste is
 * gone after thirty days before they share it; a `deleted_at` column would make that sentence false
 * while looking like it was true, and nobody who pasted something they regret is reassured by a flag.
 *
 * The window comes from `DECOMPILE_RETENTION_DAYS`, the same constant the page's copy is written
 * against, so the promise and its enforcement cannot drift apart.
 *
 * Idempotent by construction: a second run finds nothing older than the cutoff and deletes nothing.
 * `now` is injected so a test can move the clock without faking global timers.
 */
export async function purgeDecompiles(db: Db, now: () => Date = () => new Date()): Promise<number> {
  const cutoff = new Date(now().getTime() - DECOMPILE_RETENTION_DAYS * DAY_IN_MS);
  const deleted = await db.delete(decompiles).where(lt(decompiles.createdAt, cutoff)).returning({ id: decompiles.id });
  return deleted.length;
}

/**
 * Delete counted runs past their own, longer window.
 *
 * Separate from the decompiles purge because it answers a different promise. `decompiles` holds a
 * person's prompt and goes at thirty days because the page says so. This holds a keyed hash, two
 * integers and a timestamp — no content at all — and has to outlive the thirty-day window it exists
 * to measure, or it would delete the evidence on the day GATE 1 reads it.
 *
 * Six months, and not "forever": a measurement table with no expiry is how a count of everyone who
 * ever visited quietly becomes a permanent record.
 */
export async function purgeRunCounts(db: Db, now: () => Date = () => new Date()): Promise<number> {
  const cutoff = new Date(now().getTime() - RUN_COUNT_RETENTION_DAYS * DAY_IN_MS);
  const deleted = await db
    .delete(decompileRuns)
    .where(lt(decompileRuns.createdAt, cutoff))
    .returning({ id: decompileRuns.id });
  return deleted.length;
}
