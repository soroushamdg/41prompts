import { Badge, BlokCard, Meter, StatusIcon, Tag } from "@41prompts/ui";
import { Fragment, type CSSProperties } from "react";
import { claim } from "@/lib/site/claims";
import { AskChip, AskChipRow } from "./ask-chip";
import { CapabilityRotator, type RotatorItem } from "./capability-rotator";
import { Example } from "./example-surface";
import { ShotReplay } from "./shot-replay";

/**
 * The home page's illustrative sections — the mockup's, minus the ones that cannot be true.
 *
 * ## Every figure in here is inside an `<Example>`, and that is load-bearing
 *
 * `page.test.tsx` requires every digit on this page to be listed with a reason, and these sections
 * carry about thirty. `example-surface.tsx` explains why the marker is the mechanism rather than a
 * caption: the numbers rule skips marked examples, so **an unlabelled figure fails the build.**
 *
 * The denylist is *not* skipped. Sample data is sample data; a compliance claim in an illustration
 * is still a claim.
 *
 * ## Where the motion lives
 *
 * **Everything that moves here is CSS, with one exception.** The shot's span walk, the run demo's
 * rows and meters and the rotator's sweep are keyframes in `landing.css`, and in every case the
 * element's **resting style is the end state** — the animation supplies the `from`. That is what
 * makes `@media (prefers-reduced-motion: reduce)` correct rather than merely quiet: switching the
 * animation off leaves the finished page, never a half-drawn one.
 *
 * The exception is the capability rotator, which advances on a timer and therefore has to be a
 * client component; `Replay` is four lines of the same. Both are named in the epic's report beside
 * the Lighthouse number, because a page that hydrates is a different page from the one EPIC-016
 * shipped.
 *
 * ## What is not here
 *
 * **The trust-logo row** (NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT). Invented companies,
 * and the one element on this page that labelling cannot rescue — the whole function of a logo wall
 * is to assert that named companies are customers, so an "example" logo wall is a contradiction
 * rather than an illustration. `page.test.tsx` denylists `trusted by` for the same reason.
 *
 * **The three proof counters** — *1,240,000 prompts decompiled*, *38% contain a contradiction*,
 * *4s to roll back*. Same argument one step removed: a counter's entire content is *this is a real
 * measurement*, so marking one as an example empties it. `HomeProof` below stands where they stood
 * and answers each of them with a sentence from the registry that needs no number.
 *
 * **The lessons teaser.** There are no lessons and the word is denylisted.
 */

/* ── the product shot ─────────────────────────────────────────────────────────────────────── */

/**
 * The shot's four linked pairs, plus the expected blok that deliberately has no span.
 *
 * **The Expected card being unlinked is the product, not an omission.** An expected blok compiles
 * to a check rather than to text (ADR-003's vocabulary, `packages/core/src/compile`), so there is
 * nothing of it in the compiled pane to light up. The card says so, and the walk skips it.
 */
const SHOT_BLOKS = [
  { id: "b1", kind: "Context", text: "Support ops assistant for a subscription software company." },
  { id: "b2", kind: "Constraint", text: "Respond only with a JSON object. No prose before or after." },
  { id: "b3", kind: "Constraint", text: "Five allowed categories, confidence 0-1, reason under 20 words." },
  { id: "b4", kind: "Example", text: "Charged twice for March -> duplicate, 0.94" },
  { id: "b5", kind: "Expected", text: "Output must parse as valid JSON with exactly three keys.", check: true }
] as const;

/** The compiled pane, span by span. Each `id` matches a card, which is what the walk and the hover
 * link both read. */
const SHOT_SPANS = [
  { id: "b1", text: "You are a support operations assistant for a\nsubscription software company." },
  { id: "b2", text: "Respond only with a JSON object. No prose\nbefore or after." },
  { id: "b3", text: "Fields: category, confidence, reason.\nKeep the reason under 20 words." },
  { id: "b4", text: 'Example: "charged twice for March" -> duplicate' }
] as const;

/** `--i` orders the walk; `landing.css` turns it into a delay. */
// A string, not a number: React appends no unit to a custom property, but a literal is one
// fewer thing to have to know.
const step = (index: number): CSSProperties => ({ "--i": String(index) }) as CSSProperties;

export function ProductShot() {
  return (
    <div className="site-wrap">
      <Example what="a prompt open in the editor">
        {/* Rendered already playing, so the first pass costs no JavaScript at all. `ShotReplay`
            only ever restarts it. */}
        <div className="shot shot-playing">
          <div className="shot-bar">
            <span className="shot-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="shot-url mono">app.41prompts.ai / refund-classifier</span>
          </div>
          <div className="shot-split">
            <div className="shot-pane">
              {/* The mockup's pane bar (C1 of `plan-landing-parity.md`): a title, a `read-only`
                  pill, and a token count. **Every figure in it is inside this section's
                  `<Example>`**, which is what makes it sample data rather than a claim — see
                  `example-surface.tsx`. The token count is the mockup's literal and is the one
                  number here that is not derived: `packages/core` has no tokenizer, the only
                  estimator in the repository calls itself "deliberately crude" in its own comment,
                  and `apps/web` may not import it (rule 11). A figure in a picture of a screen is
                  a figure in a picture of a screen. */}
              <div className="shot-panebar">
                <p className="shot-panetitle">Compiled prompt</p>
                <span className="pill shot-pill">read-only</span>
                <span className="shot-panemeta mono">1,284 tok</span>
              </div>
              <pre className="shot-compiled">
                {SHOT_SPANS.map((span, index) => (
                  // The blank line is outside the span on purpose: a highlight that covered it
                  // would paint two empty rows every time a pair lit up.
                  <Fragment key={span.id}>
                    <span className="shot-span" data-b={span.id} style={step(index)}>
                      {span.text}
                    </span>
                    {index < SHOT_SPANS.length - 1 ? "\n\n" : ""}
                  </Fragment>
                ))}
              </pre>
            </div>
            <div className="shot-pane">
              <div className="shot-panebar">
                <p className="shot-panetitle">Canvas</p>
                {/* Both counts are **derived**, from the two arrays that render the cards and the
                    run demo's rows. The mockup's literals are 6 and 6 and its canvas draws six
                    cards; ours draws five, and a picture that prints a count contradicting the
                    things beside it is a picture that lies about itself. `SHOT_BLOKS.length` and
                    `RUN_ROWS.length` cannot drift from what is on screen. */}
                <span className="shot-panemeta mono">{SHOT_BLOKS.length} bloks</span>
                {/* **A `<span>`, not a `<button>`.** This is a picture of a control; a button
                    nobody can press is a promise to a keyboard reader that this page cannot keep,
                    which is the rule the rotator's `BlokCard as="div"` already follows.

                    **`checks`, not the mockup's word.** ADR-003 forbids the other one in UI
                    strings and `pnpm forbidden-words` fails the build on it. */}
                <span className="btn btn-sm shot-run">Run {RUN_ROWS.length} checks</span>
              </div>
              <ul className="shot-bloks">
                {SHOT_BLOKS.map((blok, index) => (
                  <li
                    key={blok.id}
                    className="shot-blok"
                    data-b={blok.id}
                    style={step(index)}
                  >
                    <span className="tag">{blok.kind}</span>
                    <span className="shot-blok-text">{blok.text}</span>
                    {"check" in blok ? <span className="shot-blok-note">compiles to a check, not to text</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          {/* Outside the chrome bar, because a real control has to clear 44px (rule 12) and a
              browser toolbar drawn at 52px stops reading as a browser toolbar. */}
          <div className="shot-foot">
            <p className="shot-foot-note">Each span of the compiled prompt belongs to the blok beside it.</p>
            <ShotReplay />
          </div>
        </div>
      </Example>
    </div>
  );
}

/* ── the run demo ─────────────────────────────────────────────────────────────────────────── */

const RUN_ROWS = [
  { blok: "B2", check: "No prose outside JSON", gpt: "40/40", claude: "40/40", gemini: "40/40", rate: 100 },
  { blok: "B3", check: "Category is one of the allowed values", gpt: "40/40", claude: "40/40", gemini: "37/40", rate: 97 },
  { blok: "B3", check: "Reason under 20 words", gpt: "40/40", claude: "31/40", gemini: "39/40", rate: 92 },
  { blok: "B1", check: "Never says it is a model", gpt: "40/40", claude: "40/40", gemini: "40/40", rate: 100 },
  { blok: "B6", check: "Valid JSON shape, exactly three keys", gpt: "28/40", claude: "40/40", gemini: "22/40", rate: 75 }
] as const;

export function RunDemo() {
  return (
    <section className="site-sect">
      <div className="site-wrap">
        <p className="eyebrow">Watch it run</p>
        <h2 className="home-h2">Six checks. Three models. One of them lies.</h2>
        <p className="site-lede">{claim("attribution")}</p>

        <Example what="one suite, graded across three models">
          <div className="data-table-wrap">
            <table className="data-table run-demo">
              <thead>
                <tr>
                  <th scope="col">Check, and the blok it came from</th>
                  <th scope="col">GPT</th>
                  <th scope="col">Claude</th>
                  <th scope="col">Gemini</th>
                  <th scope="col">Pass rate</th>
                </tr>
              </thead>
              <tbody>
                {RUN_ROWS.map((row, index) => (
                  <tr key={row.check} data-worst={row.rate < 80 ? "true" : undefined} style={step(index)}>
                    <td>
                      <span className="tag">{row.blok}</span> {row.check}
                    </td>
                    <td className="mono">{row.gpt}</td>
                    <td className="mono">{row.claude}</td>
                    <td className="mono">{row.gemini}</td>
                    <td>
                      {/* The figure is the signal and the bar follows it — rule 10, pass/fail is
                          never colour alone. The bar carries no hue at all: green, red and amber
                          are reserved, and `landing.spec.ts` holds this page to none of them. */}
                      <span className="run-demo-rate mono">{row.rate}%</span>
                      <span className="meter-track" aria-hidden="true">
                        <span className="meter-fill" style={{ width: `${row.rate}%` }} />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Example>
      </div>
    </section>
  );
}

/* ── failure attribution ──────────────────────────────────────────────────────────────────── */

export function Attribution() {
  return (
    <section className="site-sect">
      <div className="site-wrap site-two">
        <div>
          <p className="eyebrow">Failure attribution</p>
          <h2 className="home-h2">A red cell that points at a line.</h2>
          <p className="site-lede">{claim("verbatim-spans")}</p>
          <ul className="home-bullets">
            <li>{claim("multi-range-bloks")}</li>
            <li>{claim("constraint-from-failure")}</li>
            <li>{claim("not-graded-is-not-a-pass")}</li>
          </ul>
          <AskChipRow>
            <AskChip question="A prompt's test fails. Explain the difference between being told that the prompt failed and being told which sentence of the prompt failed, and what each one lets you do next.">
              Why does it matter which line failed?
            </AskChip>
          </AskChipRow>
        </div>

        <Example what="one model's output, and the check it failed">
          <pre className="home-output">{`{
  "category": "billing_error",
  "confidence": 0.77,
  "reason": "system double-billed",
  "suggested_action": "issue refund"
}`}</pre>
          <div className="home-failing-check">
            <span className="tag">Expected</span>
            <p>Output must parse as valid JSON with exactly three keys.</p>
            <p className="home-failing-meta">valid JSON shape · the blok that owns it</p>
          </div>
        </Example>
      </div>
    </section>
  );
}

/* ── one prompt, every model ──────────────────────────────────────────────────────────────── */

export function ProviderComparison() {
  return (
    <section className="site-sect">
      <div className="site-wrap site-two">
        <Example what="the same suite on three providers">
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Model</th>
                  <th scope="col">Passed</th>
                  <th scope="col">Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>GPT</td>
                  <td className="mono">188/200</td>
                  <td className="mono">$0.41</td>
                </tr>
                <tr>
                  <td>Claude</td>
                  <td className="mono">191/200</td>
                  <td className="mono">$0.37</td>
                </tr>
                <tr>
                  <td>Gemini</td>
                  <td className="mono">178/200</td>
                  <td className="mono">$0.12</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Example>

        <div>
          <p className="eyebrow">One prompt, every model</p>
          <h2 className="home-h2">The comparison you keep meaning to run.</h2>
          <p className="site-lede">{claim("three-providers")}</p>
          <ul className="home-bullets">
            <li>{claim("heatmap")}</li>
            <li>{claim("every-run-recorded")}</li>
            <li>{claim("unpriced-model-does-not-run")}</li>
          </ul>
          <AskChipRow>
            <AskChip question="I run the same prompt on three different models from three vendors. What should I expect to differ between them, and how would I find that out without pasting it into three playgrounds by hand?">
              Why compare models this way?
            </AskChip>
            <AskChip question="What does it mean to run a prompt's tests in continuous integration on every pull request, and what would that catch that a human review of the change would not?">
              What would this catch in CI?
            </AskChip>
          </AskChipRow>
        </div>
      </div>
    </section>
  );
}

/* ── the capability rotator ───────────────────────────────────────────────────────────────── */

/**
 * Five tabs, and the fifth is **Deliver**.
 *
 * The mockup's fifth is "Learn", teasing nine in-product lessons. There are none, Stage 7 owns
 * them, and `lessons?` is on `not-true-yet.ts`'s denylist — so the word is not shipped. What the
 * product actually does at that point in the loop is deliver the published prompt to the running
 * application, which is two shipped SDKs, so that is what the tab says.
 *
 * ## The illustrations are the product's own components (EPIC-016c)
 *
 * EPIC-016b shipped heading-and-paragraph panels; the mockup gives each of the five a small picture
 * of the product at that step. These are that picture, and **none of them is drawn** — every one is
 * assembled from `@41prompts/ui`: `BlokCard`, `Badge`, `Meter`, the deploy gate's own row classes.
 * A drawing goes stale silently the first time a component changes shape; an illustration made of
 * the component cannot.
 *
 * **Each is two elements**, which is the mockup's own count and is load-bearing rather than
 * stylistic: `.rot .tab-panel` carries a `min-height` so the page does not jump as tabs advance,
 * and five illustrations of freely different heights is exactly what that number defends against.
 *
 * **Each is inside an `<Example>`**, and that is not decoration either. These carry figures —
 * `40/40`, `0.94`, `81.7%` — and `page.test.tsx`'s numbers rule reads the page with its marked
 * examples removed, so an unmarked figure fails the build. Only one panel is visible at a time, so
 * only one marker is ever on screen.
 *
 * **The headings are the mockup's**, verbatim, wherever ADR-003 permits them. Deliver's is ours
 * because the mockup's fifth panel is about something that does not exist.
 */
const CAPABILITIES: readonly RotatorItem[] = [
  {
    value: "import",
    text: "Import",
    heading: "Paste what you already have",
    lines: [claim("decompiler"), claim("diagnostics")],
    illustration: (
      <Example what="a pasted prompt, split into bloks">
        <div className="rot-fig">
          {/* Both cards are `as="div"`: a blok in the canvas is a control, a blok in a picture of
              the canvas is not, and a button nobody can press is a promise to a keyboard reader
              that this page cannot keep. */}
          <BlokCard
            as="div"
            kind="constraint"
            className="pop"
            style={step(0)}
            kindTag={
              <>
                <Tag>Constraint</Tag>
                <Badge status="neutral">3 fragments</Badge>
              </>
            }
          >
            Output shape: JSON only, no text outside it
          </BlokCard>
          <BlokCard
            as="div"
            kind="constraint"
            className="pop"
            style={step(1)}
            kindTag={
              <>
                <Tag>Constraint</Tag>
                <Badge status="fail">conflict</Badge>
              </>
            }
          >
            Rule: no markdown in the response
          </BlokCard>
        </div>
      </Example>
    )
  },
  {
    value: "compose",
    text: "Compose",
    heading: "Build it out of parts",
    lines: [claim("blok-canvas"), claim("per-blok-compilation")],
    illustration: (
      <Example what="two of the bloks that prompt is built from">
        <div className="rot-fig">
          {/* `data-k="role"` and `data-k="format"` in the mockup are the **decompiler's**
              classifier labels, not blok kinds. The six real kinds are in `CLAUDE.md`. */}
          <BlokCard as="div" kind="context" className="pop" style={step(0)} kindTag={<Tag>Context</Tag>}>
            Support ops assistant; classifies refund requests.
          </BlokCard>
          <BlokCard as="div" kind="example" className="pop" style={step(1)} kindTag={<Tag>Example</Tag>}>
            Charged twice for March -&gt; duplicate, 0.94
          </BlokCard>
        </div>
      </Example>
    )
  },
  {
    value: "test",
    text: "Test",
    heading: "Test it on every model",
    lines: [claim("expected-bloks-are-checks"), claim("every-run-recorded")],
    illustration: (
      <Example what="the same checks on three models">
        <div className="rot-fig">
          <div className="rot-fig-badges pop" style={step(0)}>
            {/* `Badge` always renders its glyph beside the word, so pass and fail are never carried
                by the hue alone (rule 10) — and every badge here also carries its own count. */}
            <Badge status="pass">GPT 40/40</Badge>
            <Badge status="pass">Claude 40/40</Badge>
            <Badge status="fail">Gemini 22/40</Badge>
          </div>
          <div className="rot-fig-meter pop" style={step(1)}>
            <span className="mono">Gemini 55%</span>
            <Meter value={55} status="fail" description="Gemini passed 22 of 40 checks" />
          </div>
        </div>
      </Example>
    )
  },
  {
    value: "publish",
    text: "Publish",
    heading: "Ship it without shipping code",
    lines: [claim("publish-is-a-release"), claim("gate-four-rows")],
    illustration: (
      <Example what="the publish gate, with one row stopping it">
        <div className="rot-fig">
          {/* The gate's own rows, class for class with `/app/pr/[id]/deploy`. The mockup's first
              row says "Assertions on Claude"; ADR-003's word is **check**. */}
          <ul className="deploy-rows">
            <li className="deploy-row deploy-row-fail pop" style={step(0)}>
              <span className="deploy-row-icon">
                <StatusIcon status="fail" />
              </span>
              <span className="deploy-row-what">
                <b>Checks on Claude</b>
                <span className="deploy-row-says">81.7% of checks passed</span>
                <span className="deploy-row-cost">
                  <span className="deploy-row-verdict">Stopped</span>
                  {" · "}
                  publish blocked
                </span>
              </span>
            </li>
            <li className="deploy-row deploy-row-pass pop" style={step(1)}>
              <span className="deploy-row-icon">
                <StatusIcon status="pass" />
              </span>
              <span className="deploy-row-what">
                <b>Inputs compatible with shipped apps</b>
                <span className="deploy-row-says">Every variable the Live version declares is still declared</span>
              </span>
            </li>
          </ul>
        </div>
      </Example>
    )
  },
  {
    value: "deliver",
    text: "Deliver",
    heading: "Your application reads it at runtime",
    lines: [claim("resolve-never-waits"), claim("picks-up-in-thirty-seconds")],
    illustration: (
      <Example what="an application resolving the published prompt">
        <div className="rot-fig">
          {/* The mockup's fifth panel illustrates lessons, which do not exist. This is what the
              product does at that step instead — and the line is `@41prompts/sdk`'s **real** call,
              copied from its README rather than invented: the module-level `resolve`, a `pr_` id
              with eight hex digits (`CLAUDE.md`, Naming), and the `{ status, text }` it answers
              with. An illustration of an API that does not exist is worse than no illustration. */}
          <pre className="rot-fig-code pop" style={step(0)}>
            {`const { status, text } = resolve("pr_1a2b3c4d", { customer_name: "Ada" });`}
          </pre>
          <div className="rot-fig-answer pop" style={step(1)}>
            <Badge status="neutral">Live v7</Badge>
            <span className="mono">answered from memory, without a network call</span>
          </div>
        </div>
      </Example>
    )
  }
];

export function CapabilityLoop() {
  return (
    <section className="site-sect">
      <div className="site-wrap">
        <p className="eyebrow">One platform</p>
        <h2 className="home-h2">The whole loop, in one place.</h2>
        <CapabilityRotator name="What the platform does" items={CAPABILITIES} />
      </div>
    </section>
  );
}

/* ── what stands where the counters stood ─────────────────────────────────────────────────── */

/**
 * The mockup's three proof counters, answered one for one without a number.
 *
 * *1,240,000 prompts decompiled since launch* → the decompiler is free and keeps nothing.
 * *38% of imported prompts contain a contradiction* → the rules nothing checks are named on import.
 * *4s median time to roll a bad prompt back* → Undo is one click.
 *
 * Each of the three is a registry claim citing a shipped epic and a path. The counters were not
 * measurements of anything; these are properties anybody can check in the product in a minute,
 * which is the job a counter was pretending to do.
 */
export function HomeProof() {
  return (
    <section className="site-sect home-proof">
      <div className="site-wrap">
        <p className="eyebrow">Already shipped</p>
        <h2 className="home-h2">Nothing here is coming soon.</h2>
        <ul className="home-proof-list">
          <li>{claim("decompiler-no-account")}</li>
          <li>{claim("rules-without-checks")}</li>
          <li>{claim("undo")}</li>
        </ul>
      </div>
    </section>
  );
}
