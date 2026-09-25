import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { PRICING_TIERS, amountWords, type PricingTier } from "@/lib/site/pricing";
import { SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "Pricing · 41Prompts",
  description: "Free to try. Pro is $29 a month for the account, not per seat. Team is a conversation.",
  alternates: { canonical: "/pricing" }
};

/**
 * `/pricing` — the page EPIC-072 refused, and the reason it could be built now.
 *
 * ## Why this page did not exist until this epic
 *
 * EPIC-072 declined it in as many words: *"needs EPIC-070; no checkout, no metering, prices marked
 * unvalidated."* `apps/web/lib/site/not-true-yet.ts` carried a pattern denying any per-seat or
 * per-month price anywhere in the claims registry, and **that denial was correct**: a page saying
 * $29 while nothing charged $29 is a sentence a reader could hold us to and we would lose.
 *
 * So the order was the point of the epic rather than an accident of it. Checkout, the webhook, the
 * plans table and the run gate all landed first; the claim became true; and the guard came out in
 * the same commit that made it true, with its control row. `not-true-yet.ts`'s header says so.
 *
 * ## Three tiers, and the mockup's third one is not built
 *
 * The mockup (lines 648–673) draws Free $0, Pro $29 *per seat*, Team $79 *per seat*, and gives Team
 * a list of six features. ADR-007 changes two of those and the reasons are in it:
 *
 * - **There are no seats.** Nothing in this product has multi-user accounts — no invitations, no
 *   roles, no membership table — so a per-seat charge would bill a quantity that is always exactly
 *   one. Pro is $29 for the account (ADR-007 §1).
 * - **Team has no price and no feature list** (ADR-007 §6). Five of its six mockup lines are
 *   SSO/SAML, roles, an audit log, a shared blok library and private judge models. None exists and
 *   four are separately denied by `not-true-yet.ts`. A tier with nothing to sell is a contact link.
 *
 * The mockup's Free tier also says *"1 project"* and *"1 provider"*. The product restricts neither,
 * so neither is printed: the epic's own note says to check both against what is actually enforced
 * before printing either, and a limit on a page that nothing enforces is the same class of untruth
 * this page exists to stop telling.
 *
 * ## Every number here comes from somewhere that can be checked
 *
 * `$29` is **formatted from the same cents figure the parity test holds Stripe against**
 * (`lib/site/pricing.ts`), so the page cannot drift from the Price object. The run counts are
 * claims naming `plan-gate.ts`, which is the code that refuses the run. Nothing on this page is a
 * number somebody typed because it looked right.
 */
export default function PricingPage() {
  return (
    <SitePage
      current="pricing"
      eyebrow="Pricing"
      heading="Free to try. One price after that."
      lede="Pro is a flat monthly charge for the account. There are no seats to count, nothing is deleted if you stop, and the runs you have used are on your billing page rather than on an invoice at the end of the month."
    >
      <div className="site-wrap">
        <div className="price-tiers">
          {PRICING_TIERS.map((tier) => (
            <Tier key={tier.key} tier={tier} />
          ))}
        </div>
      </div>

      {/* The three facts somebody reads *after* deciding they might pay, which are the ones a
          pricing page usually leaves out. All three are registry claims. */}
      <div className="site-sect">
        <div className="site-wrap">
          <div className="site-card">
            <div className="site-row">
              <div className="site-row-key">
                <b>Per account</b>
                <span>Not per seat</span>
              </div>
              <div className="site-row-body">
                <h2>One charge, however you work</h2>
                <p>{claim("plan-pro-price")}</p>
              </div>
            </div>
            <div className="site-row">
              <div className="site-row-key">
                <b>If you stop</b>
                <span>Nothing is lost</span>
              </div>
              <div className="site-row-body">
                <h2>Cancelling does not take anything away</h2>
                <p>{claim("plan-cancel-keeps-everything")}</p>
                <p>{claim("plan-downgrade-at-period-end")}</p>
              </div>
            </div>
            <div className="site-row">
              <div className="site-row-key">
                <b>Team</b>
                <span>A conversation</span>
              </div>
              <div className="site-row-body">
                <h2>
                  <a href="/contact">There is no Team price yet</a>
                </h2>
                <p>
                  The features a Team tier would be sold on do not exist, so there is no number to
                  print and no checkout to open. If you need something this page does not offer,
                  the contact page reaches a person.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SitePage>
  );
}

/**
 * One tier.
 *
 * **The tier's name is an `h2`, not a styled paragraph.** Three cards whose names are not headings
 * are three unlabelled regions to anybody moving through the page by heading, which is how a screen
 * reader user skims a pricing page — and `h2` under the page's one `h1` is the level `.site-grid-item
 * h2` already chose for the same reason: a jump is a lie about the structure.
 */
function Tier({ tier }: { tier: PricingTier }) {
  const amount = amountWords(tier);
  return (
    <section className={tier.emphasis ? "price-tier price-tier-best" : "price-tier"} aria-labelledby={`tier-${tier.key}`}>
      <h2 className="eyebrow price-name" id={`tier-${tier.key}`}>
        {tier.name}
      </h2>
      {amount ? <p className="price-amount">{amount}</p> : null}
      {tier.cadence ? <p className="price-cadence">{tier.cadence}</p> : null}

      {tier.inherits ? <p className="price-inherits">{tier.inherits}</p> : null}

      {tier.note?.map((paragraph) => (
        <p className="price-note" key={paragraph.slice(0, 24)}>
          {paragraph}
        </p>
      ))}

      {tier.features.length > 0 ? (
        <ul className="price-features">
          {tier.features.map((feature) => (
            <li key={feature.claimId}>
              <b>{feature.line}</b>
              <span>{claim(feature.claimId)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <a className={tier.emphasis ? "btn btn-pri price-cta" : "btn price-cta"} href={tier.cta.href}>
        {tier.cta.words}
      </a>
    </section>
  );
}
