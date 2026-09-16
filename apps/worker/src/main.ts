import { createLogger, withRequestId } from "@41prompts/logger";
import { RUN_SUITE_QUEUE, TEST_PROVIDER_KEY_QUEUE } from "@41prompts/db";
import { PgBoss } from "pg-boss";
import { db } from "./db";
import { purgeDecompiles, purgeRunCounts } from "./jobs/purge-decompiles";
import { countOverdueRunPayloads, purgeRunPayloads } from "./jobs/purge-run-payloads";
import { purgeDeletedUsers } from "./jobs/purge-deleted-users";
import { providerFor, deploymentProviders } from "./runs/provider";
import { runSuite } from "./runs/suite";
import { testStoredProviderKey } from "./runs/test-key";
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

  // EPIC-032: the third queue, in the same shape as the two above. The web sends onto it when
  // somebody triggers a run; the name lives in `@41prompts/db`'s constants because neither app may
  // import the other and a literal written out twice goes stale silently — a drifted queue name is
  // a run that sits `queued` for ever behind a spinner nobody can explain.
  await boss.createQueue(RUN_SUITE_QUEUE);
  await boss.work(RUN_SUITE_QUEUE, async ([job]) => {
    const suiteRunId = (job?.data as { suiteRunId?: string } | undefined)?.suiteRunId;
    if (suiteRunId === undefined) {
      logger.error({ job: job?.id }, `${RUN_SUITE_QUEUE}: job with no suiteRunId`);
      return;
    }
    await withRequestId(async (jobId) => {
      try {
        await runSuite(db, suiteRunId);
        logger.info({ jobId, suiteRunId }, `${RUN_SUITE_QUEUE}: ran ${suiteRunId}`);
      } catch (error) {
        logger.error({ jobId, suiteRunId, err: error }, `${RUN_SUITE_QUEUE} failed`);
        Sentry.captureException(error);
        throw error;
      }
    });
  });

  /**
   * EPIC-042's queue: test a provider key that is **already stored**.
   *
   * It is here and not in `apps/web` for one reason, and it is the whole of threat-model row
   * `043a`: testing a stored key means opening a sealed envelope, and only this process may hold
   * `KEY_ENCRYPTION_SECRET`. A key a person has just pasted needs no queue — the web has the
   * plaintext in hand and verifies it before sealing it.
   */
  await boss.createQueue(TEST_PROVIDER_KEY_QUEUE);
  await boss.work(TEST_PROVIDER_KEY_QUEUE, async ([job]) => {
    const data = job?.data as { owner?: string; provider?: string } | undefined;
    if (data?.owner === undefined || data.provider === undefined) {
      logger.error({ job: job?.id }, `${TEST_PROVIDER_KEY_QUEUE}: job with no owner or provider`);
      return;
    }
    await withRequestId(async (jobId) => {
      try {
        // **The verdict is logged, the key is not**, and `testStoredProviderKey` is the only thing
        // in this file that has ever held one. It returns a boolean and a scrubbed sentence.
        const ok = await testStoredProviderKey(db, data.owner!, data.provider!);
        logger.info({ jobId, provider: data.provider, ok }, `${TEST_PROVIDER_KEY_QUEUE}: ${data.provider} ${ok ? "works" : "did not answer"}`);
      } catch (error) {
        logger.error({ jobId, provider: data.provider, err: error }, `${TEST_PROVIDER_KEY_QUEUE} failed`);
        Sentry.captureException(error);
        throw error;
      }
    });
  });

  // **Which provider this process has, said out loud at startup.** A worker answering with the
  // deterministic fake must never be quiet about it, and a worker with no provider at all is the
  // state staging is in while EPIC-031a is deferred — the runs it refuses are correct, and this
  // line is what makes that legible in a log rather than a mystery. Never the key, only the name.
  const selected = providerFor();
  logger.info(
    { provider: selected?.name ?? "none" },
    selected === undefined
      ? "no provider configured — runs will be refused with provider_not_configured"
      : `provider: ${selected.name}`
  );

  // **And which of the three this deployment can fall back to** (EPIC-042). The line above is about
  // the process's default; this one is about what a person with no key of their own can reach. They
  // are different questions now that a run picks its provider from the model, and a deployment with
  // an Anthropic key and no Google key will refuse a Gemini run while reporting a provider above.
  const ours = deploymentProviders();
  logger.info(
    { providers: ours },
    ours.length === 0
      ? "no deployment provider keys — only a person's own key can run anything"
      : `deployment keys for: ${ours.join(", ")}`
  );

  // The readiness line. Everything above is registered, so a process waiting to drive this worker
  // can wait on a real condition rather than on a duration (`PROCESS.md`, "Wait on a condition").
  logger.info("worker queues ready");

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
