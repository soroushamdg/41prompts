import type { ReactNode } from "react";
import type { SiteNavCurrent } from "@/lib/site/links";
import { SiteFooter, SiteNavWithSession } from "./site-chrome";

/**
 * The shell every marketing page shares: skip link, nav, `<main id="main">`, footer.
 *
 * Its own component because the six pages EPIC-072 adds would otherwise repeat it six times, and a
 * skip link that is present on five pages out of six is the kind of accessibility defect that gets
 * found by a person using the site rather than by a test.
 *
 * The heading lives here too, so every page has exactly one `h1` and it is the first thing in
 * `main`. `site-pages.spec.ts` asserts that over every public route.
 */

export interface SitePageProps {
  /**
   * The nav entry to mark, when this page has one.
   *
   * **Optional since EPIC-072b**, which built the first two pages that use this shell and are not
   * in the nav. `SiteNav` has always taken `current?` and marks nothing when it is absent, which is
   * the right answer for a page reached from the footer: marking a nav entry a reader did not click
   * is a lie about where they are.
   */
  readonly current?: SiteNavCurrent;
  /** The small uppercase word above the heading. The mockup calls it an eyebrow. */
  readonly eyebrow: string;
  readonly heading: string;
  /** One paragraph under the heading. Optional: `/changelog` is a list and does not want one. */
  readonly lede?: ReactNode;
  readonly children: ReactNode;
}

export function SitePage({ current, eyebrow, heading, lede, children }: SitePageProps) {
  return (
    <>
      <SiteNavWithSession current={current} />

      <main id="main">
        <div className="site-sect">
          <div className="site-wrap site-page-head">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{heading}</h1>
            {lede ? <p className="site-lede">{lede}</p> : null}
          </div>
        </div>
        {children}
      </main>

      <SiteFooter />
    </>
  );
}

/** One item in a hairline grid: an eyebrow, a heading, a sentence. */
export function GridItem({ group, title, body }: { group: string; title: string; body: string }) {
  return (
    <div className="site-grid-item">
      <p className="eyebrow">{group}</p>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

export type StepTone = "neutral" | "pass" | "fail" | "drift";

const TONE_CLASS: Readonly<Record<StepTone, string>> = {
  neutral: "",
  pass: " site-step-marker-pass",
  fail: " site-step-marker-fail",
  drift: " site-step-marker-drift"
};

/**
 * A row with a marker, a bold line and an explanation.
 *
 * **The marker carries a glyph as well as a colour**, which is `CLAUDE.md` rule 10 — pass and
 * failure are never shown by colour alone — and it is why `tone` picks a class rather than a colour
 * and why `mark` is required.
 */
export function Step({
  mark,
  title,
  body,
  tone = "neutral"
}: {
  mark: string;
  title: string;
  body?: string;
  tone?: StepTone;
}) {
  return (
    <li className="site-step">
      <span className={`site-step-marker${TONE_CLASS[tone]}`} aria-hidden="true">
        {mark}
      </span>
      <span className="site-step-body">
        <b>{title}</b>
        {body ? <span>{body}</span> : null}
      </span>
    </li>
  );
}
