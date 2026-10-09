import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.05,
  // No Session Replay: it would record the key inputs.
  beforeSend: (event) => scrubEvent(event),
  beforeBreadcrumb: (b) => (b.category === "ui.input" ? null : b),
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
