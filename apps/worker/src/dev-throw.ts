import { createLogger } from "@41prompts/logger";
import { initSentry, Sentry } from "./sentry";

const logger = createLogger("worker");

// The worker's answer to apps/web/app/dev/throw/route.ts (EPIC-004's Sentry pipeline proof) --
// there's no HTTP server here to hang a route off, so this is a one-off script instead, run
// inside the deployed container with `node --import tsx/esm apps/worker/src/dev-throw.ts`
// (infra/RUNBOOK.md documents the exact `docker exec` command). Same DEPLOY_ENV gate as
// /dev/throw: refuses in production.
async function main(): Promise<void> {
  if (process.env.DEPLOY_ENV === "production") {
    logger.error("dev-throw refused: DEPLOY_ENV is production");
    process.exitCode = 1;
    return;
  }

  initSentry();
  const error = new Error("EPIC-004 apps/worker dev-throw: deliberate error to verify the Sentry pipeline");
  logger.error({ err: error }, "dev-throw");
  Sentry.captureException(error);
  // The process exits right after this; Sentry's transport is async and buffered, so without an
  // explicit flush the event can be dropped before it ever leaves the process.
  await Sentry.flush(5000);
  process.exitCode = 1;
}

main();
