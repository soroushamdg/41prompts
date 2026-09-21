import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
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

function flatten(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<[^>]+>/g, " ")
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
  it("leads with the failure, not the tool", () => {
    // The position, decided 2026-09-11. If this sentence changes, it changes because Soroush
    // replaced it, not because somebody tidied the hero.
    expect(text).toContain("A prompt change ships. Nothing checks it. You find out from a user.");
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
    expect(text).toContain("Prompts often have rules nothing checks.");
  });

  it("names bloks and checks in the subhead, and promises nothing else", () => {
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
    const allowed = new Map([
      ["01", "step number in the three-step strip"],
      ["02", "step number"],
      ["03", "step number"],
      ["41", "the product's name"],
      ["100", "the input cap in KB — MAX_INPUT_BYTES, enforced in code"],
      ["30", "the shared-link retention window in days — DECOMPILE_RETENTION_DAYS, enforced by the purge job"],
      ["2026", "the year in the footer's © line, which EPIC-056 added once there was a company to name"]
    ]);
    const numbers = textWithoutExamples.match(/\d[\d.,]*/g) ?? [];
    for (const number of numbers) {
      expect(allowed.has(number), `unexplained number "${number}" on the landing page`).toBe(true);
    }
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
