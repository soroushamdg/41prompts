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

/**
 * Whether this visitor may be counted.
 *
 * **EPIC-015 changed the default for anonymous production traffic, and the reason matters.**
 * EPIC-004 decision 8 made it opt-in: no session, production, no cookie meant no capture, because
 * there was no banner yet and nothing to measure. EPIC-015 is the thirty-day window that decides
 * whether the wedge is real, every visitor in it is anonymous and in production, and opt-in would
 * have made the funnel read **zero for thirty days** — a measurement that looks like a result.
 *
 * EPIC-015 decision 9 settles the direction: *"a visitor who **declines** is not counted"*. Declining
 * is an act, so the default is counted, and declining is honoured three ways:
 *
 * - **`DNT: 1`** — a browser-level "do not track", respected even though it is advisory.
 * - **`Sec-GPC: 1`** — Global Privacy Control, the one with actual legal weight in some
 *   jurisdictions, and the one a 2026 browser is more likely to send.
 * - **A consent cookie set to anything but `granted`** — EPIC-017's banner writes this; until it
 *   exists nobody has one, which is the whole point of the default.
 *
 * The consequence, and it belongs in the report rather than in a footnote: **the 300 will be an
 * undercount.** Anyone sending DNT or GPC is invisible to the funnel by design.
 */
export function hasAnalyticsConsent(options: {
  isSignedIn: boolean;
  consentCookie?: string;
  doNotTrack?: string | null;
  globalPrivacyControl?: string | null;
}): boolean {
  // Declining wins everywhere, including outside production and including for a signed-in user.
  // A setting that only applies in some environments is not a setting anybody can trust.
  if (options.doNotTrack === "1" || options.globalPrivacyControl === "1") {
    return false;
  }
  if (options.consentCookie !== undefined && options.consentCookie !== "granted") {
    return false;
  }

  const deployEnv = process.env.DEPLOY_ENV ?? "development";
  if (deployEnv !== "production") {
    return true;
  }
  if (options.isSignedIn) {
    return true;
  }
  // The EPIC-015 change: an anonymous visitor with no stated preference is counted.
  return true;
}

/** The cookie EPIC-017's banner will write. Named here so both epics use one spelling. */
export const CONSENT_COOKIE_NAME = "41prompts_analytics_consent";

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
