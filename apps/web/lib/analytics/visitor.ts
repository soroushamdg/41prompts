import { clientAddress, hashIdentity } from "@41prompts/db";
import { cookies, headers } from "next/headers";
import type { EventName } from "./events";
import { captureEvent, CONSENT_COOKIE_NAME, hasAnalyticsConsent } from "./posthog-server";

/**
 * Counting anonymous visitors for EPIC-015's thirty-day window, without learning anything new
 * about them.
 *
 * **The distinct id is the address hash EPIC-014 already computes** — HMAC with a per-deployment
 * salt, never reversible, never stored raw (`packages/db/src/hash-identity.ts`). Nothing extra is
 * collected to make this measurement, and PostHog receives a hash that means nothing outside this
 * deployment.
 *
 * What that id is *not* is a person. An office behind one NAT is one id; somebody on a train is
 * several. **"300 unique decompiles" means 300 distinct address hashes**, and the report says so,
 * because a number that gets read at a gate needs its error bars attached.
 *
 * A caller with no usable address is counted under a single shared bucket rather than dropped — the
 * funnel's ratios matter more than its absolute floor, and silently discarding a slice of traffic
 * would bias them.
 */
const UNKNOWN_CALLER = "anonymous-no-address";

export async function captureVisitorEvent(name: EventName, properties?: Record<string, unknown>): Promise<void> {
  const header = await headers();

  const allowed = hasAnalyticsConsent({
    isSignedIn: false,
    consentCookie: (await cookies()).get(CONSENT_COOKIE_NAME)?.value,
    doNotTrack: header.get("dnt"),
    globalPrivacyControl: header.get("sec-gpc")
  });
  if (!allowed) return;

  captureEvent(hashIdentity(clientAddress(header)) ?? UNKNOWN_CALLER, name, properties);
}
