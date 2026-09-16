import * as Sentry from "@sentry/node";
import { literalSecretMatcher, scrubSecrets, secretsFromEnv } from "@41prompts/logger";

let initialized = false;

// Inert when SENTRY_DSN is unset (local dev, CI, and any environment before Soroush creates the
// project and sets the key in Coolify — infra/ACCESS.md rule 7, EPIC-004's own division of
// labour): `Sentry.captureException` is always safe to call, it just does nothing without a
// configured client. `release`/`environment` mirror `/healthz`'s own COMMIT_SHA/DEPLOY_ENV
// reading so an issue in Sentry and a deploy's health check always agree on which commit is live.
export function initSentry(): void {
  if (initialized) {
    return;
  }
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    return;
  }
  // EPIC-043: the worker is the process that will hold an opened provider key in memory while it
  // calls a model, so it is the one whose exceptions are most likely to carry one. `beforeSend`
  // walks every event for a key shape and for this deployment's own configured secrets before it
  // leaves. Built once, here, because `process.env` is settled by the time `initSentry` runs.
  const literals = literalSecretMatcher(secretsFromEnv(process.env));
  const scrub = <T>(event: T): T => scrubSecrets(event, literals);

  Sentry.init({
    dsn,
    environment: process.env.DEPLOY_ENV ?? "development",
    release: process.env.COMMIT_SHA,
    beforeSend: scrub,
    beforeSendTransaction: scrub,
    beforeBreadcrumb: scrub,
  });
  initialized = true;
}

export { Sentry };
