"use client";

import { Button } from "@41prompts/ui";
import { useEffect, useState } from "react";
import { CONSENT_COOKIE_NAME } from "@/lib/analytics/consent-cookie";
import { setAnalyticsConsent, type ConsentChoice } from "@/lib/site/consent-actions";

/**
 * Change the analytics choice, permanently reachable.
 *
 * The banner asks once. **This is the part that makes the choice real**: Law 25 and the GDPR both
 * require withdrawing consent to be as easy as giving it, and a banner somebody dismissed three
 * weeks ago is not a way to withdraw anything.
 *
 * It states the current answer in words before offering to change it, because a control that shows
 * two buttons and no current value leaves you guessing which one you are already on.
 */
export function ConsentControl() {
  const [choice, setChoice] = useState<ConsentChoice | "unset" | undefined>(undefined);

  useEffect(() => {
    const entry = document.cookie.split("; ").find((c) => c.startsWith(`${CONSENT_COOKIE_NAME}=`));
    const value = entry?.split("=")[1];
    setChoice(value === "granted" ? "granted" : value === "denied" ? "denied" : "unset");
  }, []);

  async function set(next: ConsentChoice) {
    setChoice(next);
    await setAnalyticsConsent(next);
  }

  // Until the cookie has been read there is no honest thing to say, so it says nothing rather than
  // guessing and correcting itself a frame later.
  if (choice === undefined) return null;

  return (
    <section className="legal-consent" aria-labelledby="consent-control-heading">
      <h2 id="consent-control-heading">Your analytics choice</h2>
      <p role="status">
        {choice === "granted"
          ? "Analytics are allowed. Nothing about you is sold, and this can be switched off here."
          : choice === "denied"
            ? "Analytics are off. Nothing about your visit is sent to PostHog."
            : "You have not chosen yet, so analytics are off."}
      </p>
      <div className="legal-consent-actions">
        <Button size="sm" variant="ghost" onClick={() => void set("denied")} aria-pressed={choice === "denied"}>
          Turn analytics off
        </Button>
        <Button size="sm" variant="ghost" onClick={() => void set("granted")} aria-pressed={choice === "granted"}>
          Allow analytics
        </Button>
      </div>
    </section>
  );
}
