import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { SitePage, Step } from "../site-page";

export const metadata: Metadata = {
  title: "Docs · 41Prompts",
  description:
    "Quickstart, the five 41p commands, the TypeScript and Python SDKs, and what to run in CI. Reference for delivering a prompt to a running application.",
  alternates: { canonical: "/docs" }
};

/**
 * Reference, and the page most at risk of describing a command that does not behave as written.
 *
 * Two corrections to the mockup, both load-bearing:
 *
 * 1. Its CI transcript runs `npx 41prompts run` and shows a pass rate. **`41p run` calls no model**
 *    (EPIC-053 §8) — it prints the bytes your program would send — and there is no key-authenticated
 *    run endpoint to build one on. The CI command is `41p check`.
 * 2. The package it installs is `41prompts`, which is not the name of anything. The npm packages are
 *    `@41prompts/sdk` and `@41prompts/cli`, and `41p` is the unscoped CLI.
 *
 * `claims.ts` holds the sentences; the commands are spelled here because a command is not a claim,
 * it is an identifier, and `cli-commands.test.ts` pins them to the CLI's own command table.
 */
export default function DocsPage() {
  return (
    <SitePage
      current="docs"
      eyebrow="Docs"
      heading="Reference"
      lede="Everything here is a command or a function that exists in this repository. Where something is not built, this page says so rather than describing it."
    >
      <div className="site-wrap">
        <div className="site-two">
          <div className="site-card">
            <div className="site-card-head">Quickstart</div>
            <div className="site-card-body">
              <ol className="site-steps">
                <Step mark="1" title="Paste a prompt into the decompiler" body={claim("decompiler")} />
                <Step mark="2" title="Add an expected blok" body={claim("expected-bloks-are-checks")} />
                <Step mark="3" title="Run it" body={claim("three-providers")} />
                <Step mark="4" title="Publish it" body={claim("publish-is-a-release")} />
              </ol>
            </div>
          </div>

          <div className="site-card">
            <div className="site-card-head">The CLI</div>
            <div className="site-card-body">
              <ol className="site-steps">
                <Step mark="▸" title="41p link" body={claim("cli-never-writes-the-key")} />
                <Step mark="▸" title="41p pull" body="Writes prompts.ts or prompts.py, a lockfile, and the bundled builds a cold start reads." />
                <Step mark="▸" title="41p check" body={claim("cli-check-exit-codes")} />
                <Step mark="▸" title="41p run" body={claim("cli-run-prints")} />
                <Step mark="▸" title="41p decompile" body={claim("cli-decompile-offline")} />
              </ol>
            </div>
          </div>
        </div>
      </div>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-two">
            <div>
              <p className="eyebrow">In your application</p>
              <h2>Resolve a prompt.</h2>
              <p className="site-lede">{claim("resolve-never-waits")}</p>
              <p className="site-lede">{claim("never-throws")}</p>
            </div>
            <div className="site-card">
              <div className="site-card-head">
                <span className="mono">TypeScript</span>
              </div>
              <pre className="site-code">{`import { createClient } from "@41prompts/sdk";

const prompts = createClient({
  apiKey: process.env.FORTYONE_API_KEY
});

const { status, text } = prompts.resolve(
  "pr_1a2b3c4d",
  { customer_name: "Ada" }
);
if (status === "ok") await model.complete(text);`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-two">
            <div className="site-card">
              <div className="site-card-head">
                <span className="mono">Python</span>
              </div>
              <pre className="site-code">{`import fortyone

result = fortyone.resolve(
    "pr_1a2b3c4d",
    {"customer_name": "Ada"},
)
if result.status == "ok":
    model.complete(result.text)`}</pre>
            </div>
            <div className="site-card">
              <div className="site-card-head">
                <span className="mono">In CI</span>
              </div>
              <pre className="site-code">{`$ 41p check
  prompts.ts is current with 41p.lock.json
  4 prompts · 4 bundled builds present
  exit 0`}</pre>
            </div>
          </div>
          <p className="site-lede">{claim("cli-check-exit-codes")}</p>
        </div>
      </section>
    </SitePage>
  );
}
