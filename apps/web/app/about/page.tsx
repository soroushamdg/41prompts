import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { GridItem, SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "About · 41Prompts",
  description:
    "41Prompts started in Montréal in 2026. One person builds it, the engine is Apache-2.0, and an application that depends on it keeps running when it does not.",
  alternates: { canonical: "/about" }
};

/**
 * Who is behind this, and what happens to you if that person stops.
 *
 * ## Three things the mockup says that this page does not
 *
 * `docs/design/41prompts-full-mockup.html` draws this page at lines 864–878 with **two cards, both
 * reading "Co-founder"**, and dates the company to **2025**. EPIC-072 refused to build it for
 * exactly that reason — *"names a second co-founder — your fact, not mine"* — and Soroush settled
 * it on 2026-09-20: **not a current co-founder, omit the name.**
 *
 * 1. **One person, not two.** `company-pages.test.tsx` counts them, so a second card is a
 *    failing test rather than a line somebody has to notice in review.
 * 2. **2026, not 2025.** This repository's first commit is `2134832`, dated 2026-09-03. The epic
 *    file says to check the year against it rather than copy the mockup's, and it is wrong by one.
 * 3. **"I", never "we built" and never "our team".** `lib/site/not-true-yet.ts` refuses
 *    `\bour team\b` outright, with the mockup's own *"Co-founder. Engineering."* as the control
 *    that proves the pattern can still fire. "Founder" does not match it and is what is true.
 *
 * ## Why an about page for a one-person company has a second half
 *
 * The reader this is written for — `CLAUDE.md`'s ICP, an engineer who owns a production prompt — is
 * not reading this for the origin story. They are working out what happens to the thing they are
 * about to depend on if the one person behind it stops. That question has two honest answers that
 * are already in the claims registry and already enforced by code, so the page ends on them rather
 * than on a mission statement: the engine is Apache-2.0, and the SDK never needed us to be up.
 */
export default function AboutPage() {
  return (
    <SitePage
      eyebrow="About"
      heading="I got tired of guessing which prompt was better."
      lede="41Prompts started in Montréal in 2026, after one too many afternoons spent scrolling a two-thousand-token prompt looking for the line that broke production. It is the tool I wanted: prompts made of parts, each part testable, each failure traceable."
    >
      <div className="site-wrap">
        {/* **The `.site-row` idiom, not the mockup's two side-by-side cards.** With one person the
            mockup's `.two` leaves half a row empty, and an empty half reads as a card that failed
            to load rather than as a decision — which is exactly what the drive is for. This is the
            shape `/guides` and `/changelog` already use for a fact against a sentence, and one row
            of it fills its width the way one of two cards does not.

            `data-person` is the mechanism `company-pages.test.tsx` counts, and it is an attribute
            rather than a class so that restyling this cannot quietly change what the test
            measures. */}
        <div className="site-card">
          <div className="site-row" data-person="Soroush Bonab">
            <div className="site-row-key">
              <b>Founder</b>
              <span>Montréal, Québec</span>
            </div>
            <div className="site-row-body">
              <h2>Soroush Bonab</h2>
              <p>
                Writes the code, the epics and the tests. There is nobody else, which is what the section below is
                about.
              </p>
            </div>
          </div>
        </div>
      </div>

      <section className="site-sect">
        <div className="site-wrap">
          <p className="eyebrow">If I stop</p>
          <h2>The two answers that do not depend on me.</h2>
          <div className="site-grid">
            <GridItem group="Open source" title="The engine is public" body={claim("open-source-core")} />
            <GridItem group="Uptime" title="Your application does not wait on mine" body={claim("fails-safe")} />
          </div>
          <p className="site-lede">
            Where the servers are, what is kept and for how long is on <a href="/legal/privacy">Privacy</a>. What is
            built and what is only written down is on <a href="/security">Security</a>, which says which is which.
          </p>
        </div>
      </section>
    </SitePage>
  );
}
