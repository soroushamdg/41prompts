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
 * **Opt-in, and the round trip is worth recording.** EPIC-004 made it opt-in. EPIC-015 briefly made
 * it opt-out, because the M1 funnel ran through here and opt-in would have made it read zero for
 * thirty days. That lasted a day: counting anonymous EU and Québec visitors by default, with a
 * cookie and a stable id, through a processor outside Canada, is not defensible under GDPR or Law 25
 * whatever it does for the number — and a banner is the wrong fix, because a number gathered behind
 * one measures who accepts banners.
 *
 * **The measurement moved instead.** M1 is now counted server-side into our own Postgres
 * (`lib/decompile/record-run.ts`): no cookie, no third party, nothing leaving Montréal. PostHog stays
 * wired and supplementary, and fires only for somebody who has explicitly said yes.
 *
 * Declining is still honoured three ways, and still outranks everything:
 *
 * - **`DNT: 1`** — a browser-level "do not track", respected even though it is advisory.
 * - **`Sec-GPC: 1`** — Global Privacy Control, the one with actual legal weight in some
 *   jurisdictions, and the one a 2026 browser is more likely to send.
 * - **A consent cookie set to anything but `granted`** — EPIC-017's banner writes this; until it
 *   exists nobody has one, which is the whole point of the default.
 *
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
  // **Explicit consent, and nothing less.** An anonymous visitor who has not said yes is not sent to
  // PostHog at all. See the note above for why the opposite default lasted less than a day.
  return options.consentCookie === "granted";
}

/**
 * The cookie EPIC-017's banner writes. **Defined in `./consent-cookie` and re-exported here**, so a
 * client component can import the name without dragging `posthog-node` and `next/headers` into the
 * browser bundle. Every existing importer keeps working.
 */
export { CONSENT_COOKIE_NAME } from "./consent-cookie";

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
