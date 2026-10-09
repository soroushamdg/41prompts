import * as Sentry from "@sentry/nextjs";
import { scrubEvent } from "@/lib/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  tracesSampleRate: 0.05,
  beforeSend: (event) => scrubEvent(event),
});
