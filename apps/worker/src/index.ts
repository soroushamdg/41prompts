import { createLogger } from "@41prompts/logger";
import { main } from "./main";
import { Sentry } from "./sentry";

const logger = createLogger("worker");

main().catch((error: unknown) => {
  logger.error({ err: error }, "worker failed to start");
  Sentry.captureException(error);
  process.exit(1);
});
