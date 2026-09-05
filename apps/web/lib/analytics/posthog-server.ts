import { PostHog } from "posthog-node";
import { type EventName, isEventName } from "./events";

// Lazy, same reason as lib/db.ts/lib/auth.ts: this module is imported (transitively, via
// lib/auth.ts) at `next build` time, which never has runtime env vars.
let cached: PostHog | undefined;

function getClient(): PostHog | undefined {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) {
    return undefined;
  }
  if (!cached) {
    cached = new PostHog(apiKey, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Server-side calls here happen inside a Better Auth hook, once per sign-in — not a
      // hot path — so flush immediately rather than batching and risking a lost event on
      // process exit.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return cached;
}

// EPIC-004 decision 8: the PostHog client must not make analytics impossible to disable later.
// True everywhere except: production, no session, and no explicit consent — that combination is
// "an anonymous visitor in production with no cookie banner yet" (EPIC-017 builds the banner;
// until then, anonymous production traffic is simply not captured). A signed-in call site (every
// real caller in this epic — identify/signup/login only ever fire for an authenticated user) is
// always allowed.
export function hasAnalyticsConsent(options: { isSignedIn: boolean; consentCookie?: string }): boolean {
  const deployEnv = process.env.DEPLOY_ENV ?? "development";
  if (deployEnv !== "production") {
    return true;
  }
  if (options.isSignedIn) {
    return true;
  }
  return options.consentCookie === "granted";
}

// User id only, never an email or any other PII (decision 3).
export function identifyUser(distinctId: string): void {
  const client = getClient();
  if (!client) {
    return;
  }
  client.identify({ distinctId });
}

// Validated against the closed set at runtime, not just by the `EventName` type — a caller that
// bypasses TypeScript (a cast, a future dynamic dispatch) still can't send an ad hoc event name.
export function captureEvent(distinctId: string, name: EventName, properties?: Record<string, unknown>): void {
  if (!isEventName(name)) {
    throw new Error(`"${name}" is not one of the allowed event names (see lib/analytics/events.ts)`);
  }
  const client = getClient();
  if (!client) {
    return;
  }
  client.capture({ distinctId, event: name, properties });
}
