import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { SitePage, GridItem } from "../site-page";

export const metadata: Metadata = {
  title: "Security · 41Prompts",
  description:
    "Provider keys sealed before they are stored, no 41Prompts in your traffic path, an application that keeps running when we do not, and two published threat models.",
  alternates: { canonical: "/security" }
};

/**
 * What is true about how this handles keys, traffic and data.
 *
 * **The mockup's sixth item said "SOC 2 in progress. Type I underway."** Nobody has started one, and
 * a compliance claim is the single most expensive sentence a pre-revenue company can put on a page:
 * it is the one a buyer's security review reads first and the one they will ask for evidence of.
 * `claims.test.ts` refuses the phrase outright, with the mockup's own sentence as the control that
 * proves the refusal can fire.
 *
 * Its fifth said retention is controllable per project. It is not; the three numbers are global and
 * they come from the constants the purge jobs read, so this page and the jobs cannot disagree.
 *
 * What replaces both is what actually exists: two threat models, written down and published, with
 * their open findings visible rather than summarised.
 */
export default function SecurityPage() {
  return (
    <SitePage
      current="security"
      eyebrow="Security"
      heading="Your prompts, your keys, your traffic."
      lede="This page describes what is built. Where something is written down but not yet done, it says that instead."
    >
      <div className="site-wrap">
        <div className="site-grid site-grid-3">
          <GridItem group="Keys" title="Bring your own" body={claim("byo-keys")} />
          <GridItem group="Keys" title="Checked before stored" body={claim("key-verified-before-stored")} />
          <GridItem group="Traffic" title="We are not in your path" body={claim("not-in-your-path")} />
          <GridItem group="Uptime" title="Fails safe" body={claim("fails-safe")} />
          <GridItem group="Publishing" title="Checks gate a release" body={claim("publish-is-a-release")} />
          <GridItem group="Publishing" title="Every publish recorded" body={claim("publish-anyway-audited")} />
          <GridItem group="Delivery" title="Builds are addressed by content" body={claim("build-is-addressed")} />
          <GridItem group="Delivery" title="Rate limited after authentication" body={claim("rate-limited")} />
          <GridItem group="Keys" title="Shown once" body={claim("api-keys-shown-once")} />
        </div>
      </div>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-two">
            <div>
              <p className="eyebrow">What we will not claim</p>
              <h2>A content address is not a signature.</h2>
              <p className="site-lede">{claim("content-address-is-not-a-signature")}</p>
              <p className="site-lede">{claim("cache-directory-refused")}</p>
              <p className="site-lede">
                {claim("threat-models-public")} They are in the public repository, findings and all, rather than
                summarised here.
              </p>
            </div>
            <div className="site-card">
              <div className="site-card-head">How long things are kept</div>
              <div className="site-card-body">
                <ul className="site-steps">
                  <li className="site-step">
                    <span className="site-step-marker" aria-hidden="true">
                      ▸
                    </span>
                    <span className="site-step-body">
                      <b>A shared decompile</b>
                      <span>{claim("retention-decompile")}</span>
                    </span>
                  </li>
                  <li className="site-step">
                    <span className="site-step-marker" aria-hidden="true">
                      ▸
                    </span>
                    <span className="site-step-body">
                      <b>What a provider returned</b>
                      <span>{claim("retention-payloads")}</span>
                    </span>
                  </li>
                  <li className="site-step">
                    <span className="site-step-marker" aria-hidden="true">
                      ▸
                    </span>
                    <span className="site-step-body">
                      <b>Counts of what you ran</b>
                      <span>{claim("retention-run-counts")}</span>
                    </span>
                  </li>
                </ul>
                <p style={{ marginTop: "var(--spacing-s4)", fontSize: "14px" }}>
                  The full table, with what each row is for, is on <a href="/legal/privacy">Privacy</a>. To report a
                  vulnerability, see <a href="/legal/security">our security policy</a>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-grid">
            <GridItem group="Open source" title="The engine is Apache-2.0" body={claim("open-source-core")} />
            <GridItem group="Runs" title="Every run is recorded" body={claim("every-run-recorded")} />
            <GridItem group="Spend" title="A cap that cannot be blown" body={claim("budget-caps")} />
            <GridItem group="Spend" title="No price, no run" body={claim("unpriced-model-does-not-run")} />
            <GridItem group="Access" title="Keyboard and touch" body={claim("keyboard-and-touch")} />
          </div>
        </div>
      </section>
    </SitePage>
  );
}
