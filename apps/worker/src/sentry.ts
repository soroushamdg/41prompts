import * as Sentry from "@sentry/node";

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
  Sentry.init({
    dsn,
    environment: process.env.DEPLOY_ENV ?? "development",
    release: process.env.COMMIT_SHA,
  });
  initialized = true;
}

export { Sentry };
