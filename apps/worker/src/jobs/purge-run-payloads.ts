import { runs, RUN_PAYLOAD_RETENTION_DAYS, type Db } from "@41prompts/db";
import { lte, sql } from "drizzle-orm";

/**
 * Delete the raw provider payloads whose retention window has closed.
 *
 * ## Why this one needs more than a schedule
 *
 * The two purges beside it prove themselves within a month: rows appear, thirty days pass, rows go,
 * and the log line stops being zero. **This one deletes nothing for a year.** For twelve months the
 * only observable difference between a correct job and one whose `WHERE` clause never matches is a
 * log line saying `0` — and both say `0`.
 *
 * That is the shape `EPIC-006d` has: machinery that looks like enforcement, is scheduled, is
 * logged, and is not actually doing the thing. "We scheduled it" is not evidence, and a promise on
 * a public privacy page deserves better than a job nobody can check for a year.
 *
 * So there are two functions here, and the second is the point.
 *
 * ## It deletes the row, not just the payload
 *
 * The alternative — null the `payload` column and keep the metadata — was considered and is worse
 * for a reason worth writing down: the page promises that the *response* is kept twelve months, and a
 * row that survives with its hashes, model, cost and timing is still a record that this person ran
 * this prompt against this model on this day. Keeping the skeleton would make the retention sentence
 * technically true and practically misleading, which is the failure EPIC-017 was written to avoid.
 *
 * If a future epic needs the cost history to outlive the payload, that is a second table with its own
 * promise on the page, not a quiet exception to this one.
 *
 * Idempotent: a second sweep finds nothing due and deletes nothing. `now` is injected so a test can
 * move the clock without faking global timers, the same way the other two purges do it.
 */
export async function purgeRunPayloads(db: Db, now: () => Date = () => new Date()): Promise<number> {
  const deleted = await db.delete(runs).where(lte(runs.purgeAfter, now())).returning({ id: runs.id });
  return deleted.length;
}

/**
 * How many rows are **already past** their purge date.
 *
 * **This is the defence that would have caught EPIC-006d**, and it is the reason it exists rather
 * than being a nicety: it does not ask whether the job is scheduled, or whether it ran, or whether it
 * threw. It asks whether the outcome is true.
 *
 * - A working purge makes this `0` on every sweep, forever, because it has just deleted them.
 * - A purge whose query is wrong, whose schedule silently stopped, or which is quietly failing makes
 *   this **grow**, visibly, from the first row that ages past the window.
 *
 * The distinction matters most for exactly this job. A twelve-month window means a broken purge is
 * indistinguishable from a working one by its own output — `0 purged` is the correct log line for
 * both, every night, for a year. This number is the one that differs.
 *
 * Read **after** the delete in the same sweep, so the number reported is the number that survived a
 * purge rather than the number that was waiting for one.
 *
 * Soroush ruled it in on 2026-09-14: *"worth the observability cost on its own."*
 */
export async function countOverdueRunPayloads(db: Db, now: () => Date = () => new Date()): Promise<number> {
  const [row] = await db
    .select({ overdue: sql<number>`count(*)::int` })
    .from(runs)
    .where(lte(runs.purgeAfter, now()));
  return row?.overdue ?? 0;
}

/**
 * The purge date for a row written now.
 *
 * Here rather than inline at the insert site so there is one answer, and so the constant that the
 * privacy page imports is the constant the row is stamped with. `RUN_PAYLOAD_RETENTION_DAYS` is the
 * single source; the page reads it, this writes it, and `purgeRunPayloads` compares against what was
 * written rather than recomputing the window.
 */
export function purgeAfterFor(now: Date = new Date()): Date {
  const DAY_IN_MS = 24 * 60 * 60 * 1000;
  return new Date(now.getTime() + RUN_PAYLOAD_RETENTION_DAYS * DAY_IN_MS);
}
