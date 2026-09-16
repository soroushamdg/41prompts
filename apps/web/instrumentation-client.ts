import * as Sentry from "@sentry/nextjs";
import { scrubSentryEvent } from "@/lib/observability/sentry-scrub";

// Same DSN as instrumentation.ts's server/edge init — see the comment there for why one value
// covers all three runtimes for this app. Inert (no-op) when unset.
//
// Deliberately no `environment`/`release` here, unlike the server init: EPIC-008 builds one
// image and configures DEPLOY_ENV/COMMIT_SHA per environment at *container* runtime (Coolify env
// vars), but a browser bundle's `NEXT_PUBLIC_*` values are inlined at *build* time — baking
// either in would tag every browser-side event from both staging and production with whatever
// the build happened to see, which is actively misleading, not just imprecise. The acceptance
// criterion this epic actually tests (a thrown error tagged with environment/commit) is a
// server-side route (`/dev/throw`), which instrumentation.ts's runtime `process.env` read
// already tags correctly.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0,
  // EPIC-043. The browser is where a person **types** their provider key, so a console breadcrumb
  // or an error carrying the value of an input is a real path out. Shapes only here: a browser
  // holds none of this deployment's secrets and must not, so there is no literal to match on.
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
  beforeBreadcrumb: scrubSentryEvent
});

// The App Router's documented hook for tagging client-side navigation spans; exporting it is
// what silences the SDK's own "ACTION REQUIRED" build warning asking for exactly this.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
