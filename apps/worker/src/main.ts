import { createLogger, withRequestId } from "@41prompts/logger";
import { PgBoss } from "pg-boss";
import { db } from "./db";
import { purgeDecompiles, purgeRunCounts } from "./jobs/purge-decompiles";
import { countOverdueRunPayloads, purgeRunPayloads } from "./jobs/purge-run-payloads";
import { purgeDeletedUsers } from "./jobs/purge-deleted-users";
import { initSentry, Sentry } from "./sentry";
import { misconfiguredBudgetEnv } from "./summarise/abuse-check";

const PURGE_QUEUE = "purge-deleted-users";
const PURGE_CRON = "0 3 * * *"; // daily, 03:00 UTC

const PURGE_DECOMPILES_QUEUE = "purge-decompiles";
// An hour after the account purge rather than alongside it. Both are cheap, but they touch
// different tables for different promises, and a single failing queue should not take the other
// down with it — which is also why they are two queues and not one job doing both.
const PURGE_DECOMPILES_CRON = "0 4 * * *"; // daily, 04:00 UTC

const logger = createLogger("worker");

export async function main(): Promise<void> {
  initSentry();
  logger.info("worker up");

  // The summariser's budget bounds are deployment configuration, not constants, precisely so the
  // published defaults are not the deployed numbers (see summarise/abuse-check.ts). A value the
  // dashboard holds but this process could not parse falls back to that published default, which
  // is the failure this arrangement exists to prevent — so it is said out loud at startup rather
  // than left to be noticed in a bill.
  const badBudgetEnv = misconfiguredBudgetEnv();
  if (badBudgetEnv.length > 0) {
    logger.error(
      { vars: badBudgetEnv },
      `summary budget env unusable, fell back to the published defaults: ${badBudgetEnv.join(", ")}`
    );
  }

  const heartbeat = setInterval(() => {
    logger.info(`worker heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  const boss = new PgBoss(process.env.DATABASE_URL ?? "");
  boss.on("error", (error: unknown) => {
    logger.error({ err: error }, "pg-boss error");
    Sentry.captureException(error);
  });

  await boss.start();
  await boss.createQueue(PURGE_QUEUE);
  await boss.schedule(PURGE_QUEUE, PURGE_CRON);
  await boss.work(PURGE_QUEUE, async () => {
    // Each job run gets its own id (this epic's "request id" for work that isn't HTTP) so every
    // log line it produces can be correlated without threading a logger through the call.
    await withRequestId(async (jobId) => {
      try {
        const purged = await purgeDeletedUsers(db);
        logger.info({ jobId, purged }, `${PURGE_QUEUE}: purged ${purged}`);
      } catch (error) {
        logger.error({ jobId, err: error }, `${PURGE_QUEUE} failed`);
        Sentry.captureException(error);
        throw error;
      }
    });
  });

  await boss.createQueue(PURGE_DECOMPILES_QUEUE);
  await boss.schedule(PURGE_DECOMPILES_QUEUE, PURGE_DECOMPILES_CRON);
  await boss.work(PURGE_DECOMPILES_QUEUE, async () => {
    await withRequestId(async (jobId) => {
      try {
        const purged = await purgeDecompiles(db);
        // Riding the same schedule rather than taking its own queue: both are retention sweeps, both
        // are idempotent, and a second cron entry is a second thing that can silently stop.
        const purgedRuns = await purgeRunCounts(db);
        // EPIC-031. Rides this sweep for the same reason `purgeRunCounts` does, and needs it more:
        // its window is twelve months, so it will delete nothing for a year and a second cron entry
        // would be a second thing that can silently stop with nobody the wiser.
        const purgedPayloads = await purgeRunPayloads(db);
        // **Read after the delete, and the number that matters.** A twelve-month purge that works
        // and one whose WHERE never matches both log `0 purged` every night for a year; this is the
        // number that differs. Zero when the sweep is doing its job, growing when it is not — it
        // asks whether the outcome is true rather than whether the job is scheduled, which is
        // exactly what EPIC-006d's machinery could not answer about itself.
        const overduePayloads = await countOverdueRunPayloads(db);
        // The count is logged on every run, including zero: the acceptance criterion for this job is
        // that it is *observed running*, and a job that only speaks when it deletes something is
        // indistinguishable from a job that is not scheduled.
        logger.info(
          { jobId, purged, purgedRuns, purgedPayloads, overduePayloads },
          `${PURGE_DECOMPILES_QUEUE}: purged ${purged} decompiles, ${purgedRuns} run counts, ${purgedPayloads} run payloads; ${overduePayloads} overdue`
        );
      } catch (error) {
        logger.error({ jobId, err: error }, `${PURGE_DECOMPILES_QUEUE} failed`);
        Sentry.captureException(error);
        throw error;
      }
    });
  });

  // Deliberately not draining pg-boss on shutdown: it survives an ungraceful worker exit by
  // design (an in-flight job is simply picked up again by the next worker to start), so there
  // is nothing this handler needs to await before exiting.
  const shutdown = (signal: "SIGTERM" | "SIGINT"): void => {
    logger.info(`worker received ${signal}, shutting down`);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
