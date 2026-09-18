import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { SitePage } from "../site-page";

export const metadata: Metadata = {
  title: "Guides · 41Prompts",
  description: "How to do the common things. One written guide so far, and the two places to start without one.",
  alternates: { canonical: "/guides" }
};

/**
 * An index over the guides that exist, which today is one.
 *
 * The mockup draws six cards — import a prompt, write your first check, publish safely, add this to
 * CI, compare two models, handle a regression. Five of them are titles with no article behind them,
 * and a card that goes nowhere is the failure EPIC-016's decision 6 ruled out for the footer: a
 * reader clicks it, and the click is the test of everything else on the page.
 *
 * So this lists the one that exists, says plainly that it is the one, and sends a reader to the two
 * places that need no article — the decompiler, which needs no account, and the reference.
 */
export default function GuidesPage() {
  return (
    <SitePage
      current="guides"
      eyebrow="Guides"
      heading="How to do the common things"
      lede="One written so far. The rest of this list is not a set of empty pages — when a guide exists it appears here."
    >
      <div className="site-wrap">
        <div className="site-card">
          <div className="site-row">
            <div className="site-row-key">
              <b>Guide</b>
              <span>6 findings</span>
            </div>
            <div className="site-row-body">
              <h2>
                <a href="/guides/what-your-prompt-does-not-check">What your prompt does not check</a>
              </h2>
              <p>
                Six things a prompt can be wrong about that nothing will catch — contradictions, rules with no
                check, rules that cannot be checked, repetition, padding, and passages doing too much. Every example
                in it is produced by running the real detectors over a committed corpus.
              </p>
            </div>
          </div>
          <div className="site-row">
            <div className="site-row-key">
              <b>Start here</b>
              <span>No account</span>
            </div>
            <div className="site-row-body">
              <h2>
                <a href="/decompile">Take a prompt apart</a>
              </h2>
              <p>{claim("decompiler-no-account")}</p>
            </div>
          </div>
          <div className="site-row">
            <div className="site-row-key">
              <b>Reference</b>
              <span>Commands</span>
            </div>
            <div className="site-row-body">
              <h2>
                <a href="/docs">Docs</a>
              </h2>
              <p>{claim("cli-five-commands")}</p>
            </div>
          </div>
        </div>
      </div>
    </SitePage>
  );
}
