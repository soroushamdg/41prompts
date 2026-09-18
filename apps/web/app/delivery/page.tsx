import type { Metadata } from "next";
import { claim } from "@/lib/site/claims";
import { AskChip, AskChipRow } from "../ask-chip";
import { GridItem, SitePage, Step } from "../site-page";

export const metadata: Metadata = {
  title: "Delivery · 41Prompts",
  description:
    "Change a prompt here and every application using it picks it up, with no rebuild and no redeploy — and a prompt whose checks fail does not go Live.",
  alternates: { canonical: "/delivery" }
};

/**
 * The page that explains why this is not a configuration store.
 *
 * It is the mockup's most nearly true page, and the two places it was wrong are both about what
 * gets shown as proof. Its publish card advertises "2 SDK versions in the field", which is a count
 * of applications resolving — a number that needs a CDN this project does not have, and which
 * EPIC-051 §4.1 and EPIC-055's ruling 2 both record as not built. So the card shows the gate's four
 * real rows and nothing that counts anything.
 */
export default function DeliveryPage() {
  return (
    <SitePage
      current="delivery"
      eyebrow="Delivery"
      heading="Change a prompt. Your application has it in a minute."
      lede={claim("prompt-behind-a-name")}
    >
      <div className="site-wrap">
        <div className="site-grid site-grid-3">
          <GridItem
            group="Before"
            title="The prompt lives in the code"
            body="Change a word, edit a file, open a pull request, rebuild, redeploy. On a mobile release, wait for review."
          />
          <GridItem group="After" title="The prompt lives behind a name" body={claim("prompt-behind-a-name")} />
          <GridItem group="Safety" title="Checks run before it ships" body={claim("publish-is-a-release")} />
        </div>
      </div>

      <section className="site-sect">
        <div className="site-wrap">
          <p className="eyebrow">Four steps</p>
          <h2>Set up in about two minutes.</h2>
          <div className="site-two" style={{ marginTop: "var(--spacing-s5)" }}>
            <ol className="site-steps">
              <Step mark="1" title="Install the SDK" body="npm install @41prompts/sdk, or pip install fortyone-prompts." />
              <Step mark="2" title="Give it a key" body="FORTYONE_API_KEY, from Settings → API keys. It is shown once." />
              <Step mark="3" title="Pull your prompts" body="41p pull writes a typed file and the bundled copy a cold start reads." />
              <Step mark="4" title="Call them like functions" body={claim("generated-file-is-yours")} />
            </ol>
            <div className="site-card">
              <div className="site-card-head">
                <span className="mono">your-app / handler.ts</span>
              </div>
              <pre className="site-code">{`import { refundClassifier } from "./prompts";

const text = refundClassifier({ email: incoming });

const reply = await anthropic.messages.create({
  model: "claude-sonnet-5",
  messages: [{ role: "user", content: text }]
});`}</pre>
            </div>
          </div>
        </div>
      </section>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-two">
            <div className="site-card">
              <div className="site-card-head">
                <span>Publish · Draft v7</span>
              </div>
              <div className="site-card-body">
                <ol className="site-steps">
                  <Step
                    mark="✕"
                    tone="fail"
                    title="Checks on the model you publish to"
                    body="Two checks failed. Publishing stops here."
                  />
                  <Step
                    mark="✓"
                    tone="pass"
                    title="Variables your applications already send"
                    body="The contract is unchanged, so nothing in the field breaks."
                  />
                  <Step mark="!" tone="drift" title="Cost per call" body="Reported, and it does not stop a publish." />
                  <Step mark="Δ" title="1 blok added, 1 removed, 1 moved" body="Reported, so you know the size of what you are shipping." />
                </ol>
              </div>
            </div>
            <div>
              <p className="eyebrow">What a config store cannot do</p>
              <h2>A key-value store cannot fail a test.</h2>
              <p className="site-lede">{claim("gate-four-rows")}</p>
              <p className="site-lede">{claim("why-cost-does-not-stop")}</p>
              <ol className="site-steps" style={{ marginTop: "var(--spacing-s5)" }}>
                <Step mark="→" title="Undo" body={claim("undo")} />
                <Step mark="→" title="It works when we do not" body={claim("fails-safe")} />
                <Step mark="→" title="Every publish is recorded" body={claim("publish-anyway-audited")} />
                <Step mark="→" title="Nothing waits on us" body={claim("resolve-never-waits")} />
              </ol>
              <AskChipRow>
                <AskChip question="Why can a feature flag or remote config service — LaunchDarkly, Firebase Remote Config, a key-value store — not refuse to publish a prompt when that prompt's tests fail? What would a tool need to already know in order to do that?">
                  Why can&rsquo;t remote config do this?
                </AskChip>
              </AskChipRow>
            </div>
          </div>
        </div>
      </section>

      <section className="site-sect">
        <div className="site-wrap">
          <div className="site-grid site-grid-3">
            <GridItem group="Both languages" title="TypeScript and Python" body={claim("python-parity")} />
            <GridItem group="Weight" title="Zero dependencies" body={claim("zero-dependencies")} />
            <GridItem group="Failure" title="Never throws" body={claim("never-throws")} />
            <GridItem group="Speed" title="About thirty seconds" body={claim("picks-up-in-thirty-seconds")} />
            <GridItem group="Privacy" title="Telemetry is off" body={claim("telemetry-off")} />
            <GridItem group="Record" title="Live is derived" body={claim("live-is-derived")} />
          </div>
        </div>
      </section>
    </SitePage>
  );
}
