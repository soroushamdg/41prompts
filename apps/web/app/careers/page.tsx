import type { Metadata } from "next";
import { SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "Careers · 41Prompts",
  description: "No roles are open right now. When one is, it will be on this page.",
  alternates: { canonical: "/careers" }
};

/**
 * A careers page whose whole content is that there is nothing to apply for.
 *
 * ## Why it exists at all rather than being a 404
 *
 * The mockup draws three openings — founding engineer, developer advocate, design engineer — and
 * EPIC-072 refused the page on the grounds that none of them is real. Soroush settled it on
 * 2026-09-20: **not real, closed.** The epic file reads "close them" as *the openings are closed,
 * the page stays*, and that is the reading built here, because the alternative is a footer link to
 * a 404 — the exact thing EPIC-016 decision 6 ruled out for the site chrome. If the page itself is
 * unwanted, the route and the `Company` footer entry come out together; it is one commit either
 * way, and the epic says so.
 *
 * ## The phrase this page is not allowed to use, and it is the obvious one
 *
 * `site-claims.test.tsx`'s `UNBACKED` list refuses `/\bopen (?:roles|positions)\b/i` — it is there
 * so that no page can imply a company larger than this one. The epic's own acceptance criterion is
 * written as *"states plainly that there are no open roles"*, which is that phrase. The guard is
 * right and the criterion is about the meaning rather than the words: **"No roles are open right
 * now"** says the same thing and does not pretend the guard is not there.
 *
 * ## No form, no mailbox
 *
 * Out of scope by the epic, and it would be untrue anyway: `/contact` says in as many words that
 * there is no support address yet, because handing somebody one that bounces is worse than saying
 * so. This page points at that page rather than inventing a second answer to the same question.
 */
export default function CareersPage() {
  return (
    <SitePage
      eyebrow="Careers"
      heading="No roles are open right now."
      lede="That is the whole of it. This page exists so the answer is here rather than behind a link that goes nowhere."
    >
      <div className="site-wrap">
        <div className="site-card">
          <div className="site-row">
            <div className="site-row-key">
              <b>Right now</b>
              <span>Nothing</span>
            </div>
            <div className="site-row-body">
              <h2>There is no position to apply for</h2>
              <p>
                The three openings this site&apos;s prototype once drew were never real. A page listing jobs nobody
                can be hired into costs the most time for the people most likely to take it seriously, which is the
                wrong group to waste.
              </p>
            </div>
          </div>
          <div className="site-row">
            <div className="site-row-key">
              <b>When it changes</b>
              <span>Here first</span>
            </div>
            <div className="site-row-body">
              <h2>This page is the announcement</h2>
              <p>
                There is no list to join for it and no applicant mailbox. Both would be a second thing to maintain
                and a first thing to be wrong about, and neither exists today.
              </p>
            </div>
          </div>
          <div className="site-row">
            <div className="site-row-key">
              <b>Meanwhile</b>
              <span>One channel</span>
            </div>
            <div className="site-row-body">
              <h2>
                <a href="/contact">How to reach a person</a>
              </h2>
              <p>
                The contact page names the one channel that actually works today, and says plainly that there is no
                support address yet rather than handing you one that bounces.
              </p>
            </div>
          </div>
        </div>
      </div>
    </SitePage>
  );
}
