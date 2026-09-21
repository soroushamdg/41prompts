import { claim } from "@/lib/site/claims";
import { Example } from "./example-surface";

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
 * ## What is not here
 *
 * **The trust-logo row** (NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT). Invented companies,
 * and the one element on this page that labelling cannot rescue — the whole function of a logo wall
 * is to assert that named companies are customers, so an "example" logo wall is a contradiction
 * rather than an illustration. `page.test.tsx` denylists `trusted by` for the same reason.
 *
 * **The three proof counters** — *1,240,000 prompts decompiled*, *38% contain a contradiction*,
 * *4s to roll back*. Same argument one step removed: a counter's entire content is *this is a real
 * measurement*, so marking one as an example empties it. Three true sentences from the registry
 * stand where they were.
 *
 * **The lessons teaser.** There are no lessons and the word is denylisted.
 */

/* ── the product shot ─────────────────────────────────────────────────────────────────────── */

const SHOT_BLOKS = [
  { kind: "Context", text: "Support ops assistant for a subscription software company." },
  { kind: "Constraint", text: "Respond only with a JSON object. No prose before or after." },
  { kind: "Constraint", text: "Five allowed categories, confidence 0-1, reason under 20 words." },
  { kind: "Example", text: "Charged twice for March -> duplicate, 0.94" },
  { kind: "Expected", text: "Output must parse as valid JSON with exactly three keys." }
] as const;

export function ProductShot() {
  return (
    <div className="site-wrap">
      <Example what="a prompt open in the editor">
        <div className="shot">
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
              <p className="shot-panetitle">Compiled prompt</p>
              <pre className="shot-compiled">{`You are a support operations assistant for a
subscription software company.

Respond only with a JSON object. No prose
before or after.

Fields: category, confidence, reason.`}</pre>
            </div>
            <div className="shot-pane">
              <p className="shot-panetitle">Canvas</p>
              <ul className="shot-bloks">
                {SHOT_BLOKS.map((blok) => (
                  <li key={blok.text} className="shot-blok">
                    <span className="tag">{blok.kind}</span>
                    <span className="shot-blok-text">{blok.text}</span>
                  </li>
                ))}
              </ul>
            </div>
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
                {RUN_ROWS.map((row) => (
                  <tr key={row.check} data-worst={row.rate < 80 ? "true" : undefined}>
                    <td>
                      <span className="tag">{row.blok}</span> {row.check}
                    </td>
                    <td className="mono">{row.gpt}</td>
                    <td className="mono">{row.claude}</td>
                    <td className="mono">{row.gemini}</td>
                    <td>
                      {/* The figure is the signal and the bar follows it — rule 10, pass/fail is
                          never colour alone. */}
                      <span className="run-demo-rate mono">{row.rate}%</span>
                      <span className="meter-track" aria-hidden="true">
                        <span
                          className="meter-fill"
                          data-tone={row.rate >= 95 ? "pass" : row.rate >= 80 ? "drift" : "fail"}
                          style={{ width: `${row.rate}%` }}
                        />
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
        </div>
      </div>
    </section>
  );
}
