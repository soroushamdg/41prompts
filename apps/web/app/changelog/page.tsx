import type { Metadata } from "next";
import { CHANGELOG } from "@/lib/site/changelog";
import { SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "Changelog · 41Prompts",
  description: "What shipped, by stage, with the epics that shipped it. No version numbers that do not exist.",
  alternates: { canonical: "/changelog" }
};

/**
 * What shipped.
 *
 * Rows come from `lib/site/changelog.ts`, whose test checks both directions: every epic named has a
 * report in `docs/epics/reports/`, and every report is either named here or declared invisible with
 * a reason. The mockup's four rows carried version numbers — `v0.9`, `v0.8`, `v0.7`, `v0.6` — that
 * no tag in this repository matches, which is why this page has none.
 */
export default function ChangelogPage() {
  return (
    <SitePage
      current="changelog"
      eyebrow="Changelog"
      heading="What shipped"
      lede="By stage, newest first. Every line names the work that shipped it, and a test in this repository fails if something ships and this page does not mention it."
    >
      <div className="site-wrap">
        <div className="site-card">
          {CHANGELOG.map((entry) => (
            <div className="site-row" key={entry.id} id={entry.id}>
              <div className="site-row-key">
                <b>{entry.stage}</b>
                <span>{entry.epics.length === 1 ? "1 epic" : `${entry.epics.length} epics`}</span>
              </div>
              <div className="site-row-body">
                <h2>{entry.heading}</h2>
                <p>{entry.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </SitePage>
  );
}
