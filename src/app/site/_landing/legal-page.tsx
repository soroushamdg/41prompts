import { cx } from "@/lib/cx";
import { PRICING_ENABLED, SUPPORT_EMAIL } from "@/lib/env";
import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";
import s from "../landing.module.css";
import l from "../legal.module.css";

export const LEGAL_UPDATED = "9 October 2026";

/** The landing page's header and footer around a reading page. */
export function SitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.landing}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <SiteHeader pricing={PRICING_ENABLED} base="/" />
      <main id="main" className={l.page}>
        <div className={l.grid} aria-hidden="true" />
        <div className={cx(s.wrap, l.in)}>{children}</div>
      </main>
      <SiteFooter pricing={PRICING_ENABLED} supportEmail={SUPPORT_EMAIL} base="/" />
    </div>
  );
}

type LegalProps = { sheet: string; eyebrow: string; title: string; lede: string; children: React.ReactNode };

/** Terms and Privacy: a heading block and the text on a framed sheet. */
export function LegalPage({ sheet, eyebrow, title, lede, children }: LegalProps) {
  return (
    <SitePage>
      <header className={l.head}>
        <p className={cx("label", l.eyebrow)}>{eyebrow}</p>
        <h1>{title}</h1>
        <p className={l.lede}>{lede}</p>
      </header>
      <article className={cx(l.sheet, "frame frame--quiet")}>
        {children}
        <div className={l.foot}>
          <span>Last updated {LEGAL_UPDATED}</span>
          <span className="titleblock">
            <span>41prompts</span>
            <span>{sheet}</span>
            <span>Rev 1</span>
          </span>
        </div>
      </article>
    </SitePage>
  );
}

/** One numbered note on a legal sheet. */
export function Clause({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`c${n}`}>
      <span className={l.n} aria-hidden="true">
        {String(n).padStart(2, "0")}
      </span>
      <h2 id={`c${n}`}>{title}</h2>
      {children}
    </section>
  );
}

/** How to reach us: the support address when one is configured. */
export function ContactLine({ topic }: { topic: string }) {
  if (SUPPORT_EMAIL) {
    return (
      <p>
        Questions about {topic} go to <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
      </p>
    );
  }
  return <p>Questions about {topic} go to the 41prompts team. A support address will be listed here once it is set up.</p>;
}
