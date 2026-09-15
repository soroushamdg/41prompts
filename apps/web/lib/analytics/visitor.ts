import { clientAddress, hashIdentity } from "@41prompts/db";
import { cookies, headers } from "next/headers";
import type { EventName } from "./events";
import { captureEvent, CONSENT_COOKIE_NAME, hasAnalyticsConsent, identifyUser } from "./posthog-server";

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
    consentCookie: (await cookies()).get(CONSENT_COOKIE_NAME)?.value,
    doNotTrack: header.get("dnt"),
    globalPrivacyControl: header.get("sec-gpc")
  });
  if (!allowed) return;

  captureEvent(hashIdentity(clientAddress(header)) ?? UNKNOWN_CALLER, name, properties);
}

/**
 * An event about a signed-in account, through the same gate.
 *
 * ## The hole this closes
 *
 * `lib/auth.ts` called `captureEvent` **directly** for `signup` and `login`, so those two events
 * never met `hasAnalyticsConsent` at all — not the cookie, not `DNT`, not `Sec-GPC`. "Declining
 * stops everything" was therefore false for exactly the two events a signed-in person generates,
 * and EPIC-017's privacy page had already been written saying otherwise.
 *
 * Found on 2026-09-14 while making consent universal: the reported problem was that the gate
 * *granted* for signed-in users, and the larger one underneath was that these two calls never
 * reached the gate to be granted anything.
 *
 * The user id is the distinct id, never the email (EPIC-004 decision 3), and that is unchanged.
 */
export async function captureAccountEvent(
  userId: string,
  name: EventName,
  /**
   * Properties, for the events that carry a number.
   *
   * `captureEvent` has always taken these; this wrapper was the only caller that could not pass
   * any, which is why `run_passed` could exist in the closed set for two epics without ever being
   * able to say **how long it took** — and a measurement nobody can compute is not a definition.
   * EPIC-034 needs seconds-from-signup on exactly one event; the argument is optional so every
   * existing caller is unchanged.
   */
  properties?: Record<string, unknown>
): Promise<void> {
  const header = await headers();
  const allowed = hasAnalyticsConsent({
    consentCookie: (await cookies()).get(CONSENT_COOKIE_NAME)?.value,
    doNotTrack: header.get("dnt"),
    globalPrivacyControl: header.get("sec-gpc")
  });
  if (!allowed) return;

  identifyUser(userId);
  captureEvent(userId, name, properties);
}
