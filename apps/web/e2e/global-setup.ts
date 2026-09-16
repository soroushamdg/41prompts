import { createDb, RUN_SUITE_QUEUE, suiteRuns } from "@41prompts/db";
import { sql } from "drizzle-orm";

/**
 * Start every suite from a queue with nothing stale on it.
 *
 * ## The failure this exists to stop, named rather than called environmental
 *
 * Several specs trigger a run **without starting a worker** — `versions.spec.ts` and
 * `versions-page.spec.ts` both do, deliberately, because everything they assert happens at trigger
 * time and a worker would only add minutes. Each of those runs leaves a `run-suite` job on the
 * queue, and each spec's `afterAll` then deletes its test user, which cascades the `suite_runs` row
 * away and leaves the job pointing at nothing.
 *
 * Those jobs survive the run. `worker-process.ts` says why in as many words: *"pg-boss survives an
 * ungraceful exit by design — an in-flight job is picked up by the next worker to start."* The next
 * worker to start is whichever spec starts one first, and that is `activation.spec.ts`, alphabetically
 * ahead of every other. So the backlog of a previous run is drained inside the 60-second budget of a
 * test that has nothing to do with it, and the symptom is `activation` timing out waiting for
 * `Finished` — a failure with no visible relationship to its cause.
 *
 * It was observed on 2026-09-16: `activation` failed on the run after one that left jobs behind,
 * passed in isolation, and passed again on the next full run once the queue had drained. That is
 * three data points that agree, and **the conclusion is a mechanism rather than a shrug** —
 * `PROCESS.md`, "'Environmental' is a hypothesis, not a finding".
 *
 * ## Only jobs pointing at nothing
 *
 * A job whose `suiteRunId` still resolves to a row is real work and is left alone, so this cannot
 * eat a run somebody is watching. A job whose run has been deleted can never succeed: the worker
 * loads the row, finds none, and the job is retried on a schedule for ever.
 *
 * It is quiet when there is nothing to do and says what it removed when there is, because a cleanup
 * that runs in silence is one nobody can tell from a cleanup that is not running.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl === "") return;

  const db = createDb(databaseUrl);

  // pg-boss may not have created its schema yet on a fresh database; that is the clean case.
  const present = await db.execute<{ present: boolean }>(
    sql`select to_regclass('pgboss.job') is not null as present`,
  );
  if (present.rows[0]?.present !== true) return;

  const live = await db.select({ id: suiteRuns.id }).from(suiteRuns);
  const ids = live.map((row) => row.id);

  const removed = await db.execute(
    ids.length === 0
      ? sql`delete from pgboss.job where name = ${RUN_SUITE_QUEUE} and state in ('created', 'retry')`
      : sql`delete from pgboss.job
            where name = ${RUN_SUITE_QUEUE}
              and state in ('created', 'retry')
              and (data ->> 'suiteRunId') <> all(${ids})`,
  );

  if (removed.rowCount !== null && removed.rowCount > 0) {
    console.log(`[e2e] removed ${removed.rowCount} queued run-suite job(s) whose run no longer exists`);
  }
}
