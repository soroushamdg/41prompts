"use server";

import { cookies } from "next/headers";
import { CONSENT_COOKIE_NAME } from "@/lib/analytics/posthog-server";

/** A year. Long enough that nobody is asked every week, short enough that a stale yes expires. */
const CONSENT_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

/**
 * Write the visitor's analytics choice.
 *
 * **The gate this feeds already exists** — `hasAnalyticsConsent` has honoured this cookie, `DNT` and
 * `Sec-GPC` since EPIC-004, and defaults an anonymous visitor in production to *off*. EPIC-017 adds
 * the control, not the gate, which is why this file is nine lines of cookie and no policy.
 *
 * `httpOnly` is deliberately **false**: the banner has to know whether to show itself without a round
 * trip, and this value is a preference rather than a credential. Nothing is authorised by it.
 *
 * `SameSite=Lax` and `Secure` outside development, because a preference that leaks cross-site is
 * still a signal about a person.
 */
export async function setAnalyticsConsent(choice: ConsentChoice): Promise<void> {
  const store = await cookies();
  store.set(CONSENT_COOKIE_NAME, choice, {
    maxAge: CONSENT_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
    path: "/",
  });
}
