import { createLogger, withRequestId } from "@41prompts/logger";
import { PgBoss } from "pg-boss";
import { db } from "./db";
import { purgeDeletedUsers } from "./jobs/purge-deleted-users";
import { initSentry, Sentry } from "./sentry";

const PURGE_QUEUE = "purge-deleted-users";
const PURGE_CRON = "0 3 * * *"; // daily, 03:00 UTC

const logger = createLogger("worker");

export async function main(): Promise<void> {
  initSentry();
  logger.info("worker up");

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
