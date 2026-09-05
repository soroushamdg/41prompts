import { PgBoss } from "pg-boss";
import { db } from "./db";
import { purgeDeletedUsers } from "./jobs/purge-deleted-users";

const PURGE_QUEUE = "purge-deleted-users";
const PURGE_CRON = "0 3 * * *"; // daily, 03:00 UTC

export async function main(): Promise<void> {
  console.log("worker up");

  const heartbeat = setInterval(() => {
    console.log(`worker heartbeat ${new Date().toISOString()}`);
  }, 60_000);

  const boss = new PgBoss(process.env.DATABASE_URL ?? "");
  boss.on("error", (error: unknown) => console.error("pg-boss error", error));

  await boss.start();
  await boss.createQueue(PURGE_QUEUE);
  await boss.schedule(PURGE_QUEUE, PURGE_CRON);
  await boss.work(PURGE_QUEUE, async () => {
    const purged = await purgeDeletedUsers(db);
    console.log(`${PURGE_QUEUE}: purged ${purged}`);
  });

  // Deliberately not draining pg-boss on shutdown: it survives an ungraceful worker exit by
  // design (an in-flight job is simply picked up again by the next worker to start), so there
  // is nothing this handler needs to await before exiting.
  const shutdown = (signal: "SIGTERM" | "SIGINT"): void => {
    console.log(`worker received ${signal}, shutting down`);
    clearInterval(heartbeat);
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
