import { PostHog } from "posthog-node";
import { literalSecretMatcher, scrubSecrets, secretsFromEnv } from "@41prompts/logger/src/scrub";
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
 * - **A consent cookie set to anything but `granted`** — EPIC-017's banner writes this.
 *
 * ## Consent is universal, from 2026-09-14 — and this reverses part of EPIC-004
 *
 * **A signed-in user who has never chosen is no longer counted.** EPIC-004 granted for a signed-in
 * user in production without a cookie, and that decision was made when there was no consent
 * mechanism at all: there was no way for anyone to say yes, so requiring a yes would have meant
 * measuring nothing. EPIC-017 built the mechanism, and the exception stopped having a reason.
 *
 * It is written here rather than left as a diff because it is a **reversal, not drift**. What
 * settled it: EPIC-017's privacy page says declining stops everything, and a privacy page that
 * describes a rule the code does not follow is the precise inaccuracy that epic's retention work
 * existed to avoid. Soroush's ruling, 2026-09-14.
 *
 * `isSignedIn` is gone from the signature rather than kept and ignored, so nobody reads a parameter
 * that no longer decides anything.
 */
export function hasAnalyticsConsent(options: {
  consentCookie?: string;
  doNotTrack?: string | null;
  globalPrivacyControl?: string | null;
}): boolean {
  // Declining wins everywhere, including outside production.
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
  // **Explicit consent, and nothing less, from anybody.** See the note above for why the opposite
  // default lasted less than a day, and why the signed-in exception did not survive having a banner.
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

/**
 * The redaction every property goes through before it reaches PostHog (EPIC-043).
 *
 * The event **name** is already validated against a closed set below. Properties are not, and cannot
 * be — a property is an arbitrary object a call site assembled — so the guard on them has to be
 * about the values rather than about the keys. `packages/logger/src/scrub.ts` has the argument for
 * why a name list is the wrong shape of defence for a credential.
 *
 * Deep import, not the package barrel: this module is server-only today but `events.ts` is shared
 * with client components, and `scrub.ts` has no imports of its own while the barrel pulls pino in.
 */
const literals = literalSecretMatcher(secretsFromEnv(process.env));

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
  client.capture({ distinctId, event: name, properties: scrubProperties(properties) });
}

/** Exported so the guard on it is a test rather than a reading of this file. */
export function scrubProperties(properties?: Record<string, unknown>): Record<string, unknown> | undefined {
  return properties === undefined ? undefined : scrubSecrets(properties, literals);
}
