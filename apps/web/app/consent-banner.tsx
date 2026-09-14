"use client";

import { Button } from "@41prompts/ui";
import { useEffect, useState } from "react";
import { setAnalyticsConsent, type ConsentChoice } from "@/lib/site/consent-actions";
import { CONSENT_COOKIE_NAME } from "@/lib/analytics/consent-cookie";

/**
 * The analytics choice, asked once.
 *
 * ## What this is not
 *
 * It is not the gate. `lib/analytics/posthog-server.ts` has refused to send anything about an
 * anonymous visitor without an explicit yes since EPIC-004, and honours `DNT` and `Sec-GPC` above
 * everything. **Nothing is being switched off here that was on** — this is the control that lets a
 * person express the choice the server already defaults in their favour, and change it later.
 *
 * ## No dark patterns, concretely (EPIC-017 decision 2)
 *
 * Both buttons are the same size, the same variant and the same weight; neither is pre-selected or
 * auto-focused; declining is one click from here rather than behind a "manage preferences" step; and
 * once answered it does not come back. The banner is a `<section>` with a heading and is reachable
 * and operable by keyboard like anything else — there is no focus trap, because trapping focus in a
 * thing you did not open is itself a dark pattern.
 *
 * ## Why it renders nothing until mounted
 *
 * The choice lives in a cookie the client can read, and rendering the banner on the server would
 * mean either sending it to people who already answered or varying the cached HTML per visitor. It
 * mounts, reads, and shows itself only if there is no answer yet — so the first paint never flashes
 * a banner at somebody who declined a month ago.
 */
export function ConsentBanner() {
  const [decided, setDecided] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    const answered = document.cookie
      .split("; ")
      .some((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`));
    setDecided(answered);
  }, []);

  /**
   * **Reserve the space the banner covers, and give it back when it goes.**
   *
   * A `position: fixed` bar at the bottom of the viewport sits *over* the page, so the last control
   * on any long page is underneath it and cannot be clicked. That is not theoretical: it broke the
   * canvas and the variables tab the first time this shipped, and the e2e suite caught it as two
   * click timeouts rather than as anything that looked like a consent bug.
   *
   * The banner measures itself rather than assuming a height, because the text wraps differently at
   * every width and a hardcoded number is wrong at one of them.
   */
  useEffect(() => {
    if (decided !== false) {
      document.body.style.removeProperty("padding-bottom");
      return;
    }
    const bar = document.querySelector<HTMLElement>(".consent");
    if (!bar) return;
    const apply = () => {
      document.body.style.setProperty("padding-bottom", `${bar.offsetHeight}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(bar);
    return () => {
      observer.disconnect();
      document.body.style.removeProperty("padding-bottom");
    };
  }, [decided]);

  async function choose(choice: ConsentChoice) {
    setDecided(true);
    await setAnalyticsConsent(choice);
  }

  if (decided !== false) return null;

  return (
    <section className="consent" aria-labelledby="consent-heading">
      <div className="consent-inner">
        <div>
          <h2 className="consent-heading" id="consent-heading">
            Analytics
          </h2>
          <p className="consent-body">
            We would like to count which pages get used, through PostHog. Nothing is sent unless you
            allow it, and you can change your mind any time on the{" "}
            <a href="/legal/privacy">privacy page</a>.
          </p>
        </div>
        <div className="consent-actions">
          <Button size="sm" variant="ghost" onClick={() => void choose("denied")}>
            Decline
          </Button>
          <Button size="sm" variant="ghost" onClick={() => void choose("granted")}>
            Allow
          </Button>
        </div>
      </div>
    </section>
  );
}
