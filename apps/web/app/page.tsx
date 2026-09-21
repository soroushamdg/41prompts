import { Button, logoMorphScript, Textarea } from "@41prompts/ui";
import type { Metadata } from "next";
import { kilobytes, MAX_INPUT_BYTES } from "@/lib/decompile/limits";
import { Attribution, CapabilityLoop, HomeProof, ProductShot, ProviderComparison, RunDemo } from "./home-sections";
import { SiteFooter, SiteNavWithSession } from "./site-chrome";
import { startDecompile } from "./start-actions";

export const metadata: Metadata = {
  title: "41Prompts — see what is actually in your prompt",
  description:
    "A prompt change ships and nothing checks it. Paste a prompt and get it back as named bloks, with every rule that nothing checks called out. Free, no account, and your prompt is not saved.",
  alternates: { canonical: "/" }
};

/**
 * The home page.
 *
 * One reader — an AI engineer who owns a production prompt — and one job: get them into
 * `/decompile` with their own prompt inside thirty seconds, without asking them for anything.
 *
 * **The hero leads with the failure** (Soroush, 2026-09-11), stated as a sequence of facts about how
 * prompts ship rather than as a threat or an accusation about their team. The four headlines that
 * lost are in the report.
 *
 * **The ask bar is the only action above the fold.** Sign in is a small nav link; sign up is not
 * promoted anywhere, because there is nothing to sign up for until Stage 2.
 *
 * Server-rendered throughout, and **every section below the fold is a server component**. The only
 * script the page ever needed was the logo morph — inline, a few hundred bytes, no hydration
 * (decision 10) — and the theme toggle.
 *
 * **EPIC-016b added three client components and the report says what each cost.** The capability
 * rotator advances on a timer, `Replay` restarts a CSS animation, and the Ask-AI chips open a
 * dialog; nothing else on this page hydrates, and the shot's walk, the run demo's rows and meters
 * and the rotator's sweep are all keyframes whose resting style is their end state. The Lighthouse
 * number either side of that is in `docs/epics/reports/EPIC-016b-report.md`, because a page that
 * hydrates is a different page from the one EPIC-016 shipped.
 */
export default function HomePage() {
  return (
    <>
      <SiteNavWithSession current="home" />

      <main id="main">
        <section className="hero">
          <div className="site-wrap">
            <h1>A prompt change ships. Nothing checks it. You find out from a user.</h1>
            <p className="hero-lede">
              Paste a prompt you already run. It comes back as named bloks, with every rule that
              nothing checks called out.
            </p>

            <form action={startDecompile} className="askbar">
              <label className="sr-only" htmlFor="ask">
                Your prompt
              </label>
              <Textarea
                id="ask"
                name="prompt"
                className="askbar-field"
                rows={4}
                spellCheck={false}
                placeholder="Paste your prompt…"
              />
              <div className="askbar-foot">
                <span className="askbar-note">
                  Up to {kilobytes(MAX_INPUT_BYTES)}. Your prompt is processed on our servers in
                  Montréal and is not saved. Create a link and it lasts 30 days; anyone with one can
                  delete it.
                </span>
                <Button type="submit" variant="primary">
                  See what nothing checks
                </Button>
              </div>
            </form>
          </div>
        </section>

        <ProductShot />

        <div className="site-wrap">
          <ol className="strip">
            <li className="strip-step">
              <p className="strip-number">01</p>
              <h2>Paste</h2>
              <p>
                A prompt you already run in production, as it is. No account, no email, and your
                prompt is not saved.
              </p>
            </li>
            <li className="strip-step">
              <p className="strip-number">02</p>
              <h2>See the bloks, and what nothing checks</h2>
              <p>
                It comes back as named bloks, each mapped to the exact text it came from, with every
                rule that has no check listed underneath.
              </p>
            </li>
            <li className="strip-step">
              <p className="strip-number">03</p>
              <h2>Add the check</h2>
              <p>
                Every rule that nothing checks comes with the check that would catch it, named in
                plain words. You add it where your tests already live.
              </p>
            </li>
          </ol>
        </div>

        <RunDemo />
        <Attribution />
        <ProviderComparison />
        <CapabilityLoop />
        <HomeProof />

        <section className="cta-band">
          <div className="site-wrap">
            <h2>Prompts often have rules nothing checks.</h2>
            <p>Free, and no account.</p>
            <div className="cta-band-actions">
              {/* An anchor wearing the button's clothes, not a Button — it navigates, so it must be
                  a link for the keyboard, the context menu and anyone middle-clicking it. */}
              <a className="btn btn-pri cta-band-link" href="/decompile">
                Open the decompiler
              </a>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
      <script dangerouslySetInnerHTML={{ __html: logoMorphScript() }} />
    </>
  );
}
