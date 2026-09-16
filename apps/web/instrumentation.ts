import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub";

// Inert when NEXT_PUBLIC_SENTRY_DSN is unset (local dev, CI, and any environment before Soroush
// creates the Sentry project and sets the key in Coolify — infra/ACCESS.md rule 7). The DSN is
// the NEXT_PUBLIC_-prefixed one deliberately: it's public by design (EPIC-004's own notes), and
// using the same value for the client and the server/edge runtimes here means one Sentry project
// covers all of `apps/web`, matching the worker's single `SENTRY_DSN`.
export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.DEPLOY_ENV ?? "development",
      release: process.env.COMMIT_SHA,
      tracesSampleRate: 0,
      // EPIC-043: nothing leaves this process without being walked for a provider key first. An
      // SDK error that echoed its own request is the path a person's credential would otherwise
      // take to a processor outside Canada. See lib/observability/sentry-scrub.ts.
      beforeSend: scrubSentryEvent,
      beforeSendTransaction: scrubSentryEvent,
      beforeBreadcrumb: scrubSentryEvent
    });
  }
}

// Captures an error thrown during server rendering / a Server Action / a Route Handler that
// Next's own error boundary would otherwise swallow before Sentry's usual instrumentation sees
// it — the App Router's documented hook for exactly this gap.
export const onRequestError = Sentry.captureRequestError;
