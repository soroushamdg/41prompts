import { DECOMPILE_RETENTION_DAYS, decompiles, type Db } from "@41prompts/db";
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
