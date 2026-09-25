import { Button, logoMorphScript, Textarea } from "@41prompts/ui";
import type { Metadata } from "next";
import { kilobytes, MAX_INPUT_BYTES } from "@/lib/decompile/limits";
import { AskBar } from "./ask-bar";
import { AskChip, AskChipRow } from "./ask-chip";
import { Attribution, CapabilityLoop, HomeProof, ProductShot, ProviderComparison, RunDemo } from "./home-sections";
import { SiteFooter, SiteNavWithSession } from "./site-chrome";
import { appOrigin } from "@/lib/site/url";
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
 * **The hero is the mockup's again** (Soroush, 2026-09-21), and that reverses his own decision of
 * 2026-09-11. EPIC-016 drafted five headlines and shipped *"A prompt change ships. Nothing checks
 * it. You find out from a user."*; `plan-landing-parity.md` put the mockup's back to him as one of
 * four questions about the landing page and he chose it. The eyebrow, the headline and the lede are
 * `41prompts-full-mockup.html`'s, verbatim.
 *
 * **The paste box stays where the mockup puts a button.** The mockup's `Paste a prompt, free` links
 * to the import screen; the paste box *is* that screen's first step, done here. So the box keeps the
 * position and the mockup's second CTA, `See the workbench`, sits under it.
 *
 * **`See the workbench` points at the app, which reverses EPIC-016d's ruling** (Soroush,
 * 2026-09-24: *match the mockup*). It pointed at `/features` because the mockup's destination is
 * `app:editor` and for a signed-out reader that is a sign-in wall — the objection was put to him
 * and he chose the mockup anyway, so it goes to the app. The consequence is unchanged and worth
 * stating rather than hiding: a visitor with no account lands on sign-in, with `next` carrying them
 * on afterwards. `/features` is still one click away in the nav, which is what stops this being a
 * dead end for somebody who only wanted to look.
 *
 * **Sign up is promoted now**, in the nav, which reverses EPIC-016 decision 2 for the same reason
 * as the headline. `site-chrome.tsx` carries that argument and `landing.spec.ts` carries the guard.
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
            <p className="eyebrow">The workbench for the prompt layer</p>
            <h1>Stop guessing which prompt works.</h1>
            <p className="hero-lede">
              Break any prompt into bloks, attach expectations to each one, and run it against every
              model at once. When something breaks, you see exactly which blok did it.
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
                {/* The mockup's `No credit card` pill. **Its dot is ink, not `--color-pass`** —
                    the mockup paints it green and green means pass (rule 10), so the one thing
                    that could not be ported is the one thing the colour was doing. */}
                <span className="pill askbar-pill">
                  <i className="pill-dot" aria-hidden="true" />
                  No credit card
                </span>
                <Button type="submit" variant="primary">
                  See what nothing checks
                </Button>
              </div>
            </form>

            <div className="hero-cta">
              {/* An anchor wearing a button's clothes, like the closing band's: it navigates.
                  Absolute and to the app host, the way the nav's own dashboard link is: `/app` on
                  the apex only 301s there, and a link that visibly goes where it says is worth more
                  than a tidy relative href. */}
              <a className="btn" href={`${appOrigin()}/app`}>
                See the workbench
              </a>
            </div>

            <AskBar />
            <AskChipRow className="asksugg">
              <AskChip question="How is 41Prompts different from Langfuse, or from a feature flag tool that can swap a string at runtime?">
                How is it different from Langfuse?
              </AskChip>
              <AskChip question="What is a blok in 41Prompts, and why break one prompt into pieces instead of editing it as one string?">
                What is a blok?
              </AskChip>
              <AskChip question="How does 41Prompts change a prompt inside an application that is already shipped, without shipping the application again?">
                How do live updates work?
              </AskChip>
              <AskChip question="Is 41Prompts a good fit for a small engineering group with one prompt in production?">
                Is it right for my team?
              </AskChip>
            </AskChipRow>
          </div>
        </section>

        <ProductShot />

        {/* The mockup's three steps, with its own titles and paragraphs restored in EPIC-016d.
            EPIC-016 wrote Paste · See the bloks · Add the check, which describes the decompiler
            rather than the product; Decompile · Assert · Ship is the loop the rest of the page and
            the rotator are about. None of the three words is on ADR-003's list. */}
        <div className="site-wrap">
          <ol className="strip">
            <li className="strip-step">
              <p className="strip-number">01</p>
              <h2>Decompile</h2>
              <p>
                Paste a prompt that already half works. Get it split into named bloks, with every
                rule that nothing checks flagged.
              </p>
            </li>
            <li className="strip-step">
              <p className="strip-number">02</p>
              <h2>Assert</h2>
              <p>
                Write what each blok is supposed to do. That expectation becomes a check, without
                you writing a test.
              </p>
            </li>
            <li className="strip-step">
              <p className="strip-number">03</p>
              <h2>Ship</h2>
              <p>
                Run the suite against every provider, keep every version, and export the same checks
                into CI.
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
            <h2>Paste a prompt. See what is wrong with it.</h2>
            <p>Free, no signup, no card.</p>
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
