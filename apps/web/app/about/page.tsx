import type { Metadata } from "next";
import { SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "About · 41Prompts",
  description: "41Prompts started in Montréal in 2026, and one person builds it.",
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
 * ## It ends where the mockup ends
 *
 * EPIC-072b gave this page a second section — *"if I stop"*, answering what happens to somebody
 * depending on a one-person company, out of the two registry claims that already say it: the engine
 * is Apache-2.0, and the SDK never needed us to be up. **Soroush removed it on 2026-09-24**, ruling
 * *same as the mockup*, and the mockup's about page is an eyebrow, a headline, a paragraph of
 * origin, and the people. Nothing after.
 *
 * Both claims are still rendered on `/security`, so the registry's "no dead claims" rule is
 * untouched and nothing this page used to say has stopped being said anywhere.
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

    </SitePage>
  );
}
