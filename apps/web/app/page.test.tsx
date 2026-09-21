import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NOT_TRUE_YET, NOT_TRUE_YET_CONTROLS } from "@/lib/site/not-true-yet";
import { claim } from "@/lib/site/claims";
import { withoutExamples } from "./example-surface";

/**
 * The nav reads the session on the server, which makes it an async component that
 * `renderToStaticMarkup` cannot render. Swapped for the **real** nav in its signed-out state rather
 * than for a stub, so the footer and nav are still in the markup these assertions walk — a truth
 * audit that skipped the chrome would not catch a testimonial added to the footer.
 * `site-chrome.test.tsx` covers both session states directly.
 */
vi.mock("@/app/site-chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/site-chrome")>();
  return { ...actual, SiteNavWithSession: () => actual.SiteNav({ signedIn: false }) };
});

const { default: Page } = await import("./page.js");

const html = renderToStaticMarkup(Page());

/**
 * **Entities are decoded, not blanked** — the same correction `site-claims.test.tsx` carries, made
 * here in EPIC-016b when the first sentence containing an apostrophe reached this page.
 *
 * `&[a-z]+;` leaves React's numeric entities alone, and React writes every apostrophe as `&#x27;`.
 * Two things go wrong at once, and both of them look like defects in the page rather than in this
 * function: the number rule reports an unexplained `27`, and every denylist pattern with an
 * apostrophe in it stops matching, because the text it is scanning says `prompt&#x27;s`.
 *
 * `site-claims.test.tsx` hit exactly this on four pages and fixed it there. This file was written
 * first, had no apostrophe on its page, and kept the bug for six epics — which is the argument for
 * the control below rather than for trusting that it is now right.
 */
function flatten(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&[a-z]+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const text = flatten(html);

/**
 * The same page with marked examples removed — what the numbers rule reads (EPIC-016b).
 *
 * The home page carries pictures of the product, and a figure inside one is part of the picture
 * rather than a claim about it. `example-surface.tsx` owns both the component and this function and
 * carries the argument; `site-claims.test.tsx` applies the identical rule to the other six pages.
 *
 * **Every other guard in this file still reads the full text**, including the social-proof patterns
 * below. A number in an illustration is sample data; a testimonial in an illustration is a
 * testimonial.
 */
const textWithoutExamples = flatten(withoutExamples(html));

describe("/", () => {
  /**
   * The hero, as the mockup writes it — **and Soroush replaced the sentence, which is the only way
   * this assertion was ever allowed to change.**
   *
   * The line it replaces was *"A prompt change ships. Nothing checks it. You find out from a
   * user."*, chosen on 2026-09-11 out of five drafts, and the note here said: *if this sentence
   * changes, it changes because Soroush replaced it, not because somebody tidied the hero.* On
   * 2026-09-21 `plan-landing-parity.md` put the mockup's headline back to him as one of four
   * questions about the landing page and he chose it. The note stands, unchanged, for the next one.
   */
  it("opens with the headline the mockup writes and Soroush chose", () => {
    expect(text).toContain("Stop guessing which prompt works.");
  });

  it("carries the mockup's eyebrow and lede above it, verbatim", () => {
    expect(text).toContain("The workbench for the prompt layer");
    expect(text).toContain(
      "Break any prompt into bloks, attach expectations to each one, and run it against every model at once."
    );
  });

  it("no longer carries the sentence it replaced", () => {
    // Not tidiness: two headlines on one page is the failure mode of a copy change made by adding.
    expect(text).not.toContain("A prompt change ships");
  });

  it("offers the mockup's second call to action, and no credit card", () => {
    expect(text).toContain("See the workbench");
    expect(text).toContain("No credit card");
    // It points where a signed-out reader can actually go. The mockup sends it to the signed-in
    // editor, which for this page's audience is a sign-in wall.
    expect(html).toMatch(/<a class="btn" href="\/features">/);
  });

  /**
   * The closing band, pinned the same way the hero sentence above is — and pinned **because the
   * other two guards cannot do it.**
   *
   * `page.test.tsx`'s patterns below catch mechanical classes: an unexplained digit, social proof,
   * fake urgency, an invented award. This heading has none of those and was still wrong three times
   * — "your prompt already has…", then "most prompts…", then "prompts usually…" — because what was
   * wrong with it each time was the **quantifier**, a claim about a population that no regex
   * separates from ordinary copy. The measured count, 11 of 25, was right from the first correction
   * onwards; only the adjective kept overreaching it.
   *
   * The visual baselines cannot do it either, and that was measured rather than assumed: with a
   * changed heading live and confirmed in the served HTML, both full-page screenshots still compared
   * clean, because `maxDiffPixelRatio: 0.01` absorbs a heading. That tolerance is right for
   * anti-aliasing and wrong as a copy guard.
   *
   * So this asserts the text. It does not detect overclaiming — nothing here can — it makes the
   * sentence a **decided** string, so changing it takes a decision rather than a tidy-up.
   */
  it("closes with the band heading as decided, so a copy change is caught by text and not by pixels", () => {
    // EPIC-016d: the mockup's, restored with the headline and under the same decision. The
    // paragraph above is about a *quantifier* — a claim about how many prompts are wrong — and this
    // sentence makes none: it is an imperative, an invitation to look, which is what the decompiler
    // does. The measured finding behind it is 11 of 25.
    expect(text).toContain("Paste a prompt. See what is wrong with it.");
    expect(text).toContain("Free, no signup, no card.");
  });

  it("names the three steps the way the rest of the page names them", () => {
    // EPIC-016d: the mockup's Decompile · Assert · Ship. EPIC-016's Paste · See the bloks · Add the
    // check described the decompiler; these three are the loop the rotator and the SDK are about.
    for (const step of ["Decompile", "Assert", "Ship"]) {
      expect(text).toContain(step);
    }
  });

  /**
   * **Renamed in EPIC-016d, because it stopped being about the subhead.** EPIC-016's lede said
   * "named bloks" and "nothing checks" in one sentence; the mockup's says "bloks" and "breaks". The
   * two phrases are still on the page — in the first step of the strip and in the proof row — so
   * this went on passing while no longer asserting what its name claimed, which is the quietest way
   * a test stops being true. It says where they are now.
   */
  it("still names bloks, and still names what nothing checks", () => {
    expect(text).toContain("named bloks");
    expect(text).toContain("nothing checks");
  });

  it("puts the ask bar on the page as a real form that posts", () => {
    // Not a link dressed as a box: the paste has to travel, and it has to travel with JavaScript off.
    expect(html).toMatch(/<form[^>]*>[\s\S]*<textarea[^>]*name="prompt"/);
    expect(html).toContain('type="submit"');
  });
});

/**
 * Criterion 10, as a test rather than as a line in a report.
 *
 * "No testimonial, logo, counter or claim on the page that is not literally true today." A sentence
 * in a report saying the check was made is worth exactly as much as the day it was written; this
 * fails the build the first time somebody pastes in a "trusted by" row.
 */
/**
 * Narrowed 2026-09-18, when EPIC-056 put "© 2026 41Prompts Inc." in the footer and this pattern
 * read the product's own name as a count: `\d[\d,.]*` takes the "41" out of "41Prompts" and
 * "Prompts" satisfies the alternation. The `\b` before the noun fixes it — a word boundary cannot
 * fall between "1" and "P", both being word characters — and it is the whole of the change.
 *
 * Narrowing a pattern that exists to catch something is how a check quietly stops catching it, so
 * the control below is not optional.
 */
const CUSTOMER_COUNT =
  /\b\d[\d,.]*\s*(?:\+|k\b|m\b)?\s*\b(?:companies|teams|engineers|developers|users|customers|prompts)/i;

/**
 * Every number on the page, justified.
 *
 * A counter is the easiest lie to add and the hardest to notice in review, because it looks like
 * data. So the rule here is inverted: a digit that appears on this page has to be listed here with
 * a reason, or the test fails and somebody has to say what it is.
 *
 * Module scope rather than inside the test, because EPIC-016b's mutation control below has to read
 * the same list — a second copy would be a control that could pass against a list the rule does not
 * use.
 */
const EXPLAINED_NUMBERS = new Map([
  ["01", "step number in the three-step strip"],
  ["02", "step number"],
  ["03", "step number"],
  ["41", "the product's name"],
  ["100", "the input cap in KB — MAX_INPUT_BYTES, enforced in code"],
  ["30", "the shared-link retention window in days — DECOMPILE_RETENTION_DAYS, enforced by the purge job"],
  ["2026", "the year in the footer's © line, which EPIC-056 added once there was a company to name"]
]);

/** A trailing full stop or comma is punctuation, not part of the number. */
function numbersIn(value: string): string[] {
  return (value.match(/\d[\d.,]*/g) ?? []).map((token) => token.replace(/[.,]+$/, ""));
}

describe("nothing on this page is a claim we cannot back", () => {
  it.each([
    ["trusted by", /trusted by/i],
    ["used by / loved by", /\b(?:used|loved|chosen) by\b/i],
    ["join N others", /\bjoin \d/i],
    ["customer counts", CUSTOMER_COUNT],
    ["testimonial furniture", /testimonial|—\s*[A-Z][a-z]+ [A-Z][a-z]+,\s*(?:CTO|CEO|VP|Head of)/],
    ["star ratings", /[★⭐]|\d(?:\.\d)?\s*\/\s*5\b/],
    ["fake urgency", /limited (?:beta|time|spots)|only \d+ (?:left|spots)|ends (?:today|soon)|countdown/i],
    ["invented awards", /#1\b|award|best[- ]in[- ]class|leading/i]
  ])("carries no %s", (_label, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  /**
   * The positive control (`CLAUDE.md`'s "every absence assertion needs a positive control").
   *
   * Everything above is `expect(text).not.toMatch(...)`, which passes when the page is clean and
   * would also pass if the pattern had been narrowed into matching nothing at all. These are the
   * strings it exists to refuse, and the strings it must go on ignoring.
   */
  it.each([
    "Trusted by 1,200 teams",
    "5k users and counting",
    "40 companies ship with us",
    "10,000+ prompts compiled",
    "3 engineers, one afternoon",
    "2m developers",
    "500+ customers",
  ])("would still catch %s", (claim) => {
    expect(claim).toMatch(CUSTOMER_COUNT);
  });

  it.each(["© 2026 41Prompts Inc.", "41Prompts", "41P", "Paste a prompt"])(
    "does not mistake %s for a count",
    (notAClaim) => {
      expect(notAClaim).not.toMatch(CUSTOMER_COUNT);
    }
  );

  it("shows no images, so there are no partner logos to be wrong about", () => {
    expect(html).not.toMatch(/<img\b/);
  });

  /**
   * Every number on the page, justified.
   *
   * A counter is the easiest lie to add and the hardest to notice in review, because it looks like
   * data. So the rule here is inverted: a digit that appears on this page has to be listed below
   * with a reason, or the test fails and somebody has to say what it is.
   */
  it("shows only numbers that are facts about the product", () => {
    for (const number of numbersIn(textWithoutExamples)) {
      expect(EXPLAINED_NUMBERS.has(number), `unexplained number "${number}" on the landing page`).toBe(true);
    }
  });

  /**
   * **The marker earning its keep**, as a mutation rather than as a claim about one.
   *
   * The rule above reads the page with its marked examples removed, which is only safe because an
   * *unmarked* figure fails it. This takes the marker off the first surface — exactly what deleting
   * its `<Example>` wrapper would do to the markup — and asserts the rule then fires. Without this,
   * the exclusion above is an exemption nobody has ever seen bite.
   */
  it("would fail if one surface lost its Example marker", () => {
    const unmarked = html
      .replace('<figure class="example">', "<div>")
      .replace("</figure>", "</div>");
    const unexplained = numbersIn(flatten(withoutExamples(unmarked))).filter(
      (number) => !EXPLAINED_NUMBERS.has(number)
    );
    expect(unexplained.length, "removing a marker left every figure still explained").toBeGreaterThan(0);
  });

  /**
   * **The example exclusion has to be doing something**, or the rule above is reading a page it
   * thinks it has filtered and has not.
   *
   * This is the positive control for `withoutExamples` on *this* page specifically: the home page
   * carries marked examples, so stripping them must change the text. The day it does not, either
   * the examples are gone — in which case somebody should notice — or the stripper has stopped
   * matching and every figure on the page is unchecked.
   *
   * `site-claims.test.tsx` proves the function's behaviour in both directions on a synthetic
   * element. This proves it is wired to the real page.
   */
  it("actually strips the marked examples it claims to", () => {
    expect(html).toContain('class="example"');
    expect(textWithoutExamples.length).toBeLessThan(text.length);
  });

  /**
   * And the other half: a marked example is not a way to smuggle social proof onto the page. The
   * patterns above read the **full** text, so this asserts the projection they read is the full one.
   */
  it("keeps every other guard reading the whole page", () => {
    expect(text).toContain("Example");
  });
});

/**
 * EPIC-016b: the mockup's home page, section by section.
 *
 * Four illustrative surfaces, a rotator, three sentences where three invented counters stood, and
 * the Ask-AI chips. Each of these is a thing the epic says is on the page; none of them is a thing
 * the two mechanical guards above would notice going missing.
 */
describe("the mockup's home page (EPIC-016b, and its rotator EPIC-016c)", () => {
  /** The caption of every marked surface. Each is required, and `what` is what makes the marker
   *  say more than "this is not real".
   *
   *  **Nine, not four, since EPIC-016c**: each of the rotator's five panels gained an illustration,
   *  and `Tabs` renders all five panels into the markup — four hidden, one shown — so all five
   *  markers are in the HTML this file reads even though only one is ever on screen. */
  const SURFACES = [
    "a prompt open in the editor",
    "one suite, graded across three models",
    "one model's output, and the check it failed",
    "the same suite on three providers",
    "a pasted prompt, split into bloks",
    "two of the bloks that prompt is built from",
    "the same checks on three models",
    "the publish gate, with one row stopping it",
    "an application resolving the published prompt"
  ] as const;

  it.each(SURFACES)("marks '%s' as an example", (what) => {
    expect(text).toContain(what);
  });

  it("marks each of them with a figure and a real caption, not a decorative word", () => {
    // `<figure>`/`<figcaption>` is what puts "Example, <what>" in the accessibility tree next to
    // the thing it describes. A styled `<span>` would look identical and announce nothing.
    expect(html.match(/<figure class="example"/g) ?? []).toHaveLength(SURFACES.length);
    expect(html.match(/example-caption/g) ?? []).toHaveLength(SURFACES.length);
    expect(html.match(/class="example-mark">Example</g) ?? []).toHaveLength(SURFACES.length);
  });

  it("decodes entities rather than blanking them", () => {
    // The control for `flatten`'s decode. `one model's output` is on the page and is the reason
    // this was found: without the decode it reads as `one model&#x27;s output` and reports a 27.
    expect(flatten("<p>a prompt&#x27;s checks &amp; nothing else</p>")).toBe("a prompt's checks & nothing else");
    expect(text).toContain("one model's output");
  });

  describe("the capability rotator", () => {
    it("is a real ARIA tablist, running down the page", () => {
      // `docs/design/README.md`: the prototypes put `aria-selected` on plain buttons. A tablist
      // with no tabs in it tells a screen reader there is something here and then hands it nothing.
      expect(html).toContain('role="tablist"');
      expect(html).toContain('aria-orientation="vertical"');
      expect(html.match(/role="tab"/g) ?? []).toHaveLength(5);
      expect(html.match(/role="tabpanel"/g) ?? []).toHaveLength(5);
      expect(html.match(/aria-selected="true"/g) ?? []).toHaveLength(1);
      expect(html.match(/aria-controls="panel-/g) ?? []).toHaveLength(5);
    });

    it.each(["Import", "Compose", "Test", "Publish", "Deliver"])("carries the %s tab", (word) => {
      expect(text).toContain(word);
    });

    it("does not ship the mockup's fifth word", () => {
      // "Learn" teases nine in-product lessons that do not exist, and `lessons?` is denylisted.
      expect(text).not.toMatch(/\bLearn\b/i);
    });

    it("would still catch the word if it came back", () => {
      expect("Learn by breaking things").toMatch(/\bLearn\b/i);
    });

    /**
     * EPIC-016c: the mockup's own headings, back verbatim.
     *
     * EPIC-016b rewrote the third one — "Say what it has to do, then check that it does" — and in
     * doing so took it away from what its panel is about. The mockup's sits over three model
     * badges, which is now what this panel shows.
     *
     * The fifth is deliberately **not** the mockup's: "Learn by breaking things" teases nine
     * lessons that do not exist, so Deliver has a heading of its own and the test below pins it
     * alongside the four that were ported.
     */
    it.each([
      ["Paste what you already have", "the mockup's, verbatim"],
      ["Build it out of parts", "the mockup's, verbatim"],
      ["Test it on every model", "the mockup's, verbatim — restored in EPIC-016c"],
      ["Ship it without shipping code", "the mockup's, verbatim"],
      ["Your application reads it at runtime", "ours; the mockup's fifth panel is about lessons"]
    ])("heads a panel with '%s' (%s)", (heading) => {
      expect(text).toContain(heading);
    });

    it("no longer carries the heading EPIC-016b wrote over the model badges", () => {
      expect(text).not.toContain("Say what it has to do");
    });

    /**
     * The illustrations, as the elements they are made of rather than as a screenshot.
     *
     * Each panel is **two elements** — the mockup's count, and the thing `.rot .tab-panel`'s
     * `min-height` is defending. A panel that quietly becomes a third picture of a canvas is the
     * one way this section grows without anybody deciding to grow it, so the count is asserted.
     */
    it("gives all five panels an illustration, and none of them more than two elements", () => {
      const figures = html.match(/<div class="rot-fig">([\s\S]*?)<\/figure>/g) ?? [];
      expect(figures).toHaveLength(5);
      for (const figure of figures) {
        expect((figure.match(/class="[^"]*\bpop\b/g) ?? []).length, figure.slice(0, 80)).toBe(2);
      }
    });

    it("builds the cards out of the six real blok kinds, never the decompiler's classifier labels", () => {
      // `docs/epics/plan-mockup-parity.md`: the mockup's `data-k="format"` and `data-k="role"` are
      // the decompiler's labels for what it *found*, not kinds a blok can have.
      const kinds = [...html.matchAll(/class="blok-card[^"]*"[^>]*data-kind="([a-z_]+)"/g)].map((m) => m[1]);
      expect(kinds.length).toBeGreaterThan(0);
      for (const kind of kinds) {
        expect(["context", "constraint", "example", "expected", "image_ref", "image_input"]).toContain(kind);
      }
    });

    it("says check where the mockup says the other word", () => {
      // The mockup's Publish panel row reads "Assertions on Claude". ADR-003's word is `check`, and
      // `pnpm forbidden-words` fails the build on the other one — this names the specific string so
      // the failure reads as "the mockup's copy came through" rather than as a grep hit.
      expect(text).toContain("Checks on Claude");
      expect(text).not.toMatch(/\bassertions?\b/i);
    });

    it("builds every panel out of the claims registry", () => {
      for (const id of [
        "decompiler",
        "diagnostics",
        "blok-canvas",
        "per-blok-compilation",
        "expected-bloks-are-checks",
        // EPIC-016c: `judge-pinned` moved out in favour of the sentence the mockup's own paragraph
        // for this panel makes — cost and latency captured on every run.
        "every-run-recorded",
        "publish-is-a-release",
        "gate-four-rows",
        "resolve-never-waits",
        "picks-up-in-thirty-seconds"
      ]) {
        expect(text, `the rotator dropped ${id}`).toContain(claim(id));
      }
    });
  });

  it("answers the mockup's three counters with three sentences from the registry", () => {
    // 1,240,000 decompiled / 38% contain a contradiction / 4s to roll back. All three invented; a
    // counter marked "example" has nothing left, so each is answered by a property instead.
    for (const id of ["decompiler-no-account", "rules-without-checks", "undo"]) {
      expect(text, `the proof row dropped ${id}`).toContain(claim(id));
    }
  });

  it("offers the Ask-AI chips, and shows the question each one will send", () => {
    // Seven since EPIC-016d: three beside section headings, and the hero's four suggestions under
    // the Ask-AI bar.
    expect(html.match(/class="ask-chip"/g) ?? []).toHaveLength(7);
    expect(text).toContain("Why does it matter which line failed?");
    expect(text).toContain("Why compare models this way?");
    expect(text).toContain("What would this catch in CI?");
  });

  /**
   * The hero's Ask-AI bar (EPIC-016d), which the mockup draws and EPIC-016 replaced with the paste
   * box. Both are here now: the paste box is the page's own action, and the bar hands a question
   * about the product to whichever assistant the reader already uses.
   */
  it("puts the mockup's Ask-AI bar in the hero, labelled and server-rendered", () => {
    expect(html).toContain('id="ask-ai"');
    // The visible `ASK AI` prefix is decorative; the field's name comes from a real label, or a
    // screen reader hears "ASK AI Ask anything…" or nothing at all.
    expect(html).toMatch(/<label class="sr-only" for="ask-ai">/);
    expect(text).toContain("Ask anything about 41Prompts");
    // It renders with the first of the mockup's five questions in place, before any timer has run.
    expect(html).toContain('placeholder="What is a blok?"');
  });

  it("offers the mockup's four suggestions under it", () => {
    for (const suggestion of [
      "How is it different from Langfuse?",
      "What is a blok?",
      "How do live updates work?",
      "Is it right for my team?"
    ]) {
      expect(text).toContain(suggestion);
    }
  });

  /**
   * The product shot's pane bar, C1 of `plan-landing-parity.md`.
   *
   * **Both counts are derived** from the arrays that render the cards and the run demo's rows, so a
   * picture cannot print a number that contradicts what is beside it. The mockup's literals are 6
   * and 6 over a canvas of six cards; ours draws five.
   */
  it("gives the shot the mockup's pane bar, with its counts derived", () => {
    expect(text).toContain("read-only");
    expect(text).toContain("1,284 tok");
    expect(text).toContain("5 bloks");
    expect(text).toContain("Run 5 checks");
  });

  it("draws the run control as a picture of one, not as a button nobody can press", () => {
    expect(html).toMatch(/<span class="btn btn-sm shot-run">Run \d+ checks<\/span>/);
  });

  it("says checks where the mockup says the other word, on the shot too", () => {
    // `pnpm forbidden-words` fails the build on it; this names the string so a failure reads as
    // "the mockup's copy came through" rather than as a grep hit.
    expect(text).not.toMatch(/\bassertions?\b/i);
  });

  it("gives the shot a Replay that is a button, not a link", () => {
    expect(html).toMatch(/<button[^>]*class="shot-replay"[^>]*>Replay<\/button>/);
  });

  /**
   * The registry denylist, over the **rendered page** rather than over the registry.
   *
   * `claims.test.ts` proves no entry in `claims.ts` matches one of these. That says nothing about a
   * heading, a caption or the word on a tab, none of which goes through the registry — and this
   * epic added eleven of those. `not-true-yet.ts` is the one list both read.
   */
  it.each(NOT_TRUE_YET)("says nothing about %s", (_name, pattern) => {
    expect(text).not.toMatch(pattern);
  });

  it.each(NOT_TRUE_YET_CONTROLS)("would still catch %s", (mockupSentence, pattern) => {
    expect(mockupSentence).toMatch(pattern);
  });
});
