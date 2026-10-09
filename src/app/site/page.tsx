import { Icon } from "@/components/icon";
import type { IconName } from "@/components/icons";
import { cx } from "@/lib/cx";
import { PRICING_ENABLED, SUPPORT_EMAIL } from "@/lib/env";
import { appUrl } from "@/lib/hosts";
import { Count, Reveal } from "./_motion/reveal";
import { Attribution } from "./_landing/attribution";
import { Bom } from "./_landing/bom";
import { HeroCrosshair } from "./_landing/hero-crosshair";
import { HeroSheet } from "./_landing/hero-sheet";
import { HowItWorks } from "./_landing/how-it-works";
import { ProductHuntBadge } from "./_landing/product-hunt-badge";
import { SiteFooter } from "./_landing/site-footer";
import { SiteHeader } from "./_landing/site-header";
import s from "./landing.module.css";

/* 41prompts.ai/, the marketing page. Ported from
   docs/mockup/41prompts.ai/index.html with the choreography of
   docs/assets/js/landing.js. Sign in and Start free go to the app host.
   With NEXT_PUBLIC_PRICING_ENABLED off, nothing on this page names a price:
   no Pricing section or links, no "$", no Start Performance. */

type Vars = React.CSSProperties & Record<`--${string}`, string | number>;

const PARTS: ReadonlyArray<{ icon: IconName; id: string; h: string; p: React.ReactNode; delay: number }> = [
  { icon: "split", id: "P03", h: "Decompiler", p: "Paste a long prompt and get it back as typed bloks, with nothing lost.", delay: 0 },
  { icon: "flask", id: "P04", h: "Tests from expects", p: "Each expects blok becomes a check. No test code to write.", delay: 60 },
  {
    icon: "search",
    id: "P06",
    h: "Search and tags",
    p: (
      <>
        <span className="kbd">⌘K</span> across names, tags and the text inside every blok.
      </>
    ),
    delay: 120,
  },
  { icon: "diff", id: "P07", h: "Semantic diff", p: "See changes per blok, next to the test results they changed.", delay: 180 },
  { icon: "users", id: "P08", h: "Shared workspaces", p: "Invite by link. Owner, editor and viewer roles. One shared library.", delay: 0 },
  { icon: "share", id: "D01", h: "Share pages", p: "A public, read-only page of a prompt’s bloks and findings. Free to view.", delay: 60 },
  { icon: "code", id: "D02", h: "Typed export", p: "Download any prompt as a typed .ts or .py function.", delay: 120 },
  { icon: "eye", id: "D03", h: "Presence", p: "See who else has a prompt open before you save over them.", delay: 180 },
];

const FAQ: ReadonlyArray<{ q: string; a: string; pricing?: true }> = [
  {
    q: "Is my prompt private?",
    a: "Yes. Every prompt and version is visible only to you. Nothing becomes public unless you create a share page, which needs Performance, and you can take that page down at any time.",
  },
  {
    q: "What do you do with my API keys?",
    a: "They run your prompts on the provider you choose and nothing else. Keys are encrypted at rest, shown once when you save them, and never written to logs. The provider bills your own account.",
  },
  {
    q: "What is free, exactly?",
    a: "Everything you need to write, save, version, run once and copy a prompt, with no limits on prompts, bloks or versions. Testing, analysis, comparison and sharing are in Performance.",
  },
  {
    q: "What happens if I cancel Performance?",
    a: "You keep every prompt, blok and version on Free. Performance tools lock again, and test results you already ran stay readable.",
    pricing: true,
  },
  {
    q: "What is a blok?",
    a: "One typed part of a prompt: context, constraint, example or expects. Each blok owns an exact span of the compiled prompt. Expects bloks describe what a good answer does, and never appear in the prompt itself.",
  },
];

/* P05 example runs. Costs show in dollars only once pricing is public;
   until then they read in cents so the page carries no "$". */
const RUNS = [
  { model: "Claude", passed: 191, p: "95.5%", cost: 0.37, p50: 1.4 },
  { model: "GPT", passed: 188, p: "94%", cost: 0.41, p50: 1.2 },
  { model: "Gemini", passed: 178, p: "89%", cost: 0.12, p50: 0.9 },
] as const;

export default function LandingPage() {
  const pricing = PRICING_ENABLED;
  const startHref = appUrl("/sign-in#start");
  return (
    <div className={s.landing}>
      <a className={s.skip} href="#main">
        Skip to content
      </a>
      <SiteHeader pricing={pricing} />

      <main id="main">
        {/* HERO: headline + Sheet 01, a looping drawing of the core loop. */}
        <section className={s.hero} aria-labelledby="hero-title">
          <div className={s.heroGrid} aria-hidden="true" />
          <div className={cx(s.wrap, s.heroIn)}>
            <div className={s.heroCopy}>
              <p className={cx("label", s.heroEyebrow)}>
                <span className={s.tick} aria-hidden="true" />
                The workbench for the prompt layer
              </p>
              <h1 className={s.heroTitle} id="hero-title">
                <span className={s.ln}>
                  <span>Stop guessing</span>
                </span>{" "}
                <span className={s.ln}>
                  <span>which prompt</span>
                </span>{" "}
                <span className={s.ln}>
                  <span>works.</span>
                </span>
              </h1>
              <p className={s.heroLede}>
                Break any prompt into bloks, see exactly what each one adds to the prompt you ship, and keep every version. When something breaks, find the blok that did it.
              </p>
              <div className={s.heroCtas}>
                <a className="btn btn--primary btn--lg btn--go" href={startHref}>
                  Start free <Icon name="arrow-right" />
                </a>
                <a className="btn btn--lg" href="#how">
                  See how it works
                </a>
              </div>
              <dl className={s.heroSpecs}>
                <div>
                  <dt>Prompts and versions</dt>
                  <dd>
                    <span className={s.infGlyph}>∞</span> on Free
                  </dd>
                </div>
                <div>
                  <dt>Card to sign up</dt>
                  <dd>None</dd>
                </div>
                <div>
                  <dt>Model providers</dt>
                  <dd>3, your keys</dd>
                </div>
              </dl>
            </div>
            <HeroSheet />
          </div>
          <HeroCrosshair />
        </section>

        {/* HOW IT WORKS: three steps; the drawing on the right is sticky and
            morphs between states as each step scrolls into view. */}
        <section className={s.how} id="how" aria-labelledby="how-title">
          <div className={s.wrap}>
            <Reveal as="header" className={s.secHead}>
              <p className={cx("label", s.dimLabel)}>
                <span>How it works</span>
              </p>
              <h2 id="how-title">From a wall of text to parts you can name.</h2>
            </Reveal>
            <HowItWorks />
          </div>
        </section>

        {/* FREE PLAN: drawn as a bill of materials. QTY ∞ = unlimited. */}
        <section className={s.free} id="free" aria-labelledby="free-title">
          <div className={s.wrap}>
            <Reveal as="header" className={s.secHead}>
              <p className={cx("label", s.dimLabel)}>
                <span>Free plan · Unlimited</span>
              </p>
              <h2 id="free-title">Everything you need to write, keep and ship a prompt. Free, with no limits.</h2>
              <p className={s.secHeadP}>No trial clock, no prompt cap, no version cap. The Free plan is the whole workbench for writing prompts.</p>
            </Reveal>
            <Bom startHref={startHref} showPrice={pricing} />
          </div>
        </section>

        {/* PERFORMANCE: three showcase drawings + the rest as a parts list. */}
        <section className={s.perf} id="performance" aria-labelledby="perf-title">
          <div className={s.perfGridBg} aria-hidden="true" />
          <div className={s.wrap}>
            <Reveal as="header" className={cx(s.secHead, s.secHeadSplit)}>
              <div>
                <p className={cx("label", s.dimLabel)}>
                  <span>Performance plan</span>
                </p>
                <h2 id="perf-title">Know which blok broke it.</h2>
              </div>
              <p className={s.secHeadP}>
                Performance adds the tools that test, measure and share a prompt. Every one of them works on the bloks you already have, so nothing changes about how you write.
              </p>
            </Reveal>

            <Attribution />

            <div className={s.showDuo}>
              {/* P02 Linter */}
              <Reveal as="article" className={cx(s.show, s.showLint, "frame")} id="lint">
                <p className={cx("mono", s.showId)}>
                  P02 <span className="stamp">Performance</span>
                </p>
                <h3>Find what nothing checks.</h3>
                <p>The linter reads your prompt on import and flags repeated rules, contradictions and lines no test could ever verify.</p>
                <div className={s.lint}>
                  <p className={s.lintText}>
                    You are a support agent for Northwind Outfitters.{" "}
                    <mark className={s.lintM} data-n="1" style={{ "--d": 0 } as Vars}>
                      Keep replies short.
                    </mark>{" "}
                    Reply in under 80 words.{" "}
                    <mark className={cx(s.lintM, s.lintMBad)} data-n="2" style={{ "--d": 1 } as Vars}>
                      Always offer a full refund when an order is late.
                    </mark>{" "}
                    Never promise a refund.{" "}
                    <mark className={s.lintM} data-n="3" style={{ "--d": 2 } as Vars}>
                      Be helpful and friendly.
                    </mark>
                  </p>
                  <ol className={s.lintList}>
                    <li style={{ "--d": 0 } as Vars}>
                      <span className={s.lintB}>1</span>
                      <span>
                        <b>Repeats</b> “Reply in under 80 words.”
                      </span>
                    </li>
                    <li style={{ "--d": 1 } as Vars}>
                      <span className={cx(s.lintB, s.lintBBad)}>2</span>
                      <span>
                        <b>Conflicts</b> with “Never promise a refund.”
                      </span>
                    </li>
                    <li style={{ "--d": 2 } as Vars}>
                      <span className={s.lintB}>3</span>
                      <span>
                        <b>Untestable.</b> Nothing can check “helpful”.
                      </span>
                    </li>
                  </ol>
                </div>
              </Reveal>

              {/* P05 Cross-model runs */}
              <Reveal as="article" className={cx(s.show, s.showXm, "frame")} id="xm" delay={120}>
                <p className={cx("mono", s.showId)}>
                  P05 <span className="stamp">Performance</span>
                </p>
                <h3>One prompt, every model.</h3>
                <p>Run the same suite on GPT, Claude and Gemini side by side, with what each run cost and how long it took.</p>
                <div className={s.xm}>
                  <p className="label">Example · 200 checks per model</p>
                  <div className={cx(s.xmRow, s.xmRowHead)}>
                    <span>Model</span>
                    <span>Passed</span>
                    <span>Cost</span>
                    <span>p50</span>
                  </div>
                  {RUNS.map((r) => (
                    <div key={r.model} className={s.xmRow}>
                      <span>{r.model}</span>
                      <span className={s.xmPass}>
                        <span className={s.xmBar}>
                          <i style={{ "--p": r.p } as Vars} />
                        </span>
                        <span className="num">
                          <Count to={r.passed} />
                          /200
                        </span>
                      </span>
                      {pricing ? (
                        <Count className="num" to={r.cost} decimals={2} prefix="$" />
                      ) : (
                        <Count className="num" to={Math.round(r.cost * 100)} suffix="¢" />
                      )}
                      <Count className="num" to={r.p50} decimals={1} suffix="s" />
                    </div>
                  ))}
                </div>
              </Reveal>
            </div>

            <ul className={s.parts} aria-label="Also in Performance">
              {PARTS.map((part, k) => (
                <Reveal key={part.id} as="li" className={cx(s.part, "frame frame--quiet frame--live")} delay={part.delay} style={{ "--k": k } as Vars}>
                  <Icon name={part.icon} size="lg" />
                  <p className="mono">{part.id}</p>
                  <h3>{part.h}</h3>
                  <p>{part.p}</p>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>

        {pricing && <Pricing startHref={startHref} />}

        {/* FAQ */}
        <section className={s.faq} id="faq" aria-labelledby="faq-title">
          <div className={cx(s.wrap, s.faqIn)}>
            <Reveal as="header" className={s.secHead}>
              <p className={cx("label", s.dimLabel)}>
                <span>Questions</span>
              </p>
              <h2 id="faq-title">Before you paste anything.</h2>
            </Reveal>
            <Reveal className={s.faqList}>
              {FAQ.filter((f) => pricing || !f.pricing).map((f, i) => (
                <details key={f.q} className={s.qa} open={i === 0}>
                  <summary>
                    <span>{f.q}</span>
                    <span className={s.qaX} aria-hidden="true" />
                  </summary>
                  <div className={s.qaA}>
                    <p>{f.a}</p>
                  </div>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* CTA BAND */}
        <section className={s.cta} aria-labelledby="cta-title">
          <Reveal className={cx(s.wrap, s.ctaIn)}>
            <h2 id="cta-title">
              Paste a prompt.
              <br />
              See what is in it.
              <span className={s.ctaCaret} aria-hidden="true" />
            </h2>
            <div className={s.ctaBtns}>
              <a className="btn btn--primary btn--lg btn--go" href={startHref}>
                Start free <Icon name="arrow-right" />
              </a>
              {pricing ? (
                <a className="btn btn--lg" href="#pricing">
                  See pricing
                </a>
              ) : (
                <a className="btn btn--lg" href="#how">
                  See how it works
                </a>
              )}
            </div>
            <p className="muted">Free, unlimited, no card.</p>
            <ProductHuntBadge />
          </Reveal>
        </section>
      </main>

      <SiteFooter pricing={pricing} supportEmail={SUPPORT_EMAIL} />
    </div>
  );
}

/* PRICING: rendered only with NEXT_PUBLIC_PRICING_ENABLED=true. */
function Pricing({ startHref }: { startHref: string }) {
  return (
    <section className={s.pricing} id="pricing" aria-labelledby="pricing-title">
      <div className={s.wrap}>
        <Reveal as="header" className={cx(s.secHead, s.secHeadCenter)}>
          <p className={cx("label", s.dimLabel)}>
            <span>Pricing</span>
          </p>
          <h2 id="pricing-title">Two plans. One of them is free forever.</h2>
        </Reveal>
        <div className={s.plans}>
          <Reveal as="article" className={cx(s.plan, "frame frame--live")}>
            <header className={s.planHead}>
              <span className="label">Free</span>
              <span className="chip chip--ok">
                <span className="dot" />
                Unlimited
              </span>
            </header>
            <p className={s.planPrice}>
              <span className={s.planCur}>$</span>
              <span className={s.planAmt}>0</span>
              <span className={s.planPer}>forever</span>
            </p>
            <p className={s.planFor}>For writing, keeping and copying prompts.</p>
            <ul className={s.ticks}>
              <li>Unlimited prompts, bloks and versions</li>
              <li>Bloks editor with the live compiled prompt</li>
              <li>One-click copy, as a template or filled</li>
              <li>Run on one model with your own key</li>
              <li>Private library with search by name</li>
              <li>Export everything, delete anytime</li>
            </ul>
            <a className="btn btn--block btn--lg" href={startHref}>
              Start free
            </a>
          </Reveal>

          <Reveal as="article" className={cx(s.plan, s.planPerf, "frame frame--chalk frame--live")} delay={120}>
            <header className={s.planHead}>
              <span className="label">Performance</span>
              <span className="stamp">Performance</span>
            </header>
            <p className={s.planPrice}>
              <span className={s.planCur}>$</span>
              <span className={cx(s.planAmt, s.planAmtTbd)}>TBD</span>
              <span className={s.planPer}>/ month</span>
            </p>
            <p className={s.planDim} aria-hidden="true">
              <span className={s.planDimline} />
              <span className="mono">Price set before launch</span>
            </p>
            <p className={s.planFor}>For testing prompts and finding what breaks them.</p>
            <ul className={s.ticks}>
              <li>Everything in Free</li>
              <li>Failure attribution to the exact blok</li>
              <li>Linter and decompiler</li>
              <li>Tests from expects bloks</li>
              <li>GPT, Claude and Gemini side by side, with cost and latency</li>
              <li>Search inside prompts, tags and filters</li>
              <li>Semantic diffs and shared workspaces</li>
              <li>Share pages and typed function export</li>
            </ul>
            <a className="btn btn--primary btn--block btn--lg btn--go" href={appUrl("/sign-in#performance")}>
              Start Performance <Icon name="arrow-right" />
            </a>
            <p className={s.planFine}>
              <Icon name="card" size="sm" />
              Billed monthly through Stripe. Cancel anytime in the billing portal and keep everything on Free.
            </p>
          </Reveal>
        </div>
        <Reveal as="p" className={s.pricingNote}>
          Share pages are free to view for anyone, with or without an account.
        </Reveal>
      </div>
    </section>
  );
}
