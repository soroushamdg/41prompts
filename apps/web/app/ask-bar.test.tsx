import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NOT_TRUE_YET, NOT_TRUE_YET_CONTROLS } from "@/lib/site/not-true-yet";
import { AskBar, ROTATING } from "./ask-bar";
import { ASK_DESTINATIONS } from "./ask-chip";

const html = renderToStaticMarkup(<AskBar />);

/**
 * The hero's Ask-AI bar (EPIC-016d).
 *
 * `vitest.config.ts` runs this package in the `node` environment, so what is assertable here is the
 * server-rendered markup and the pure parts. **The three behaviours that need a DOM — Enter opening
 * the sheet, the placeholder rotating, and focus stopping it — are in `landing.spec.ts`**, against
 * the built app, which is where they can actually be observed rather than simulated.
 */
describe("the Ask-AI bar", () => {
  it("renders a labelled field, not a box with a placeholder for a name", () => {
    // A placeholder is not a label: it disappears the moment somebody types, and the visible
    // `ASK AI` prefix is decorative. `docs/design/README.md` lists "real ARIA" among the things the
    // prototypes get wrong and the build must get right, and the mockup uses `aria-label` here.
    expect(html).toMatch(/<label class="sr-only" for="ask-ai">Ask anything about 41Prompts<\/label>/);
    expect(html).toContain('id="ask-ai"');
  });

  it("hides the decorative prefix from the accessibility tree", () => {
    expect(html).toMatch(/<span class="askai-prefix" aria-hidden="true">/);
  });

  it("starts on the first of the mockup's questions, before any timer has run", () => {
    expect(html).toContain(`placeholder="${ROTATING[0]}"`);
    expect(ROTATING[0]).toBe("What is a blok?");
  });

  it("carries all five of the mockup's questions", () => {
    expect(ROTATING).toHaveLength(5);
  });

  /**
   * **The denylist over the four placeholders nothing else reads.**
   *
   * `page.test.tsx` runs `NOT_TRUE_YET` over the rendered home page, and only `ROTATING[0]` is in
   * that markup — the other four arrive from a timer. A sentence that reaches a reader without a
   * guard having looked at it is the gap this closes.
   */
  it.each(NOT_TRUE_YET)("says nothing about %s, in any of the five", (_name, pattern) => {
    for (const question of ROTATING) {
      expect(question, question).not.toMatch(pattern);
    }
  });

  it.each(NOT_TRUE_YET_CONTROLS)("would still catch %s", (mockupSentence, pattern) => {
    expect(mockupSentence).toMatch(pattern);
  });
});

/**
 * The four destinations, and the property that matters about them.
 *
 * `ask-chip.tsx` has said since EPIC-016b that they are *"exported so `ask-bar.test.tsx` can assert
 * every one encodes rather than interpolates"*. That file did not exist until EPIC-016d and they
 * were not exported. A comment naming a test is a claim; this is the test.
 */
describe("the ask destinations", () => {
  it("has four, each on its own host", () => {
    expect(ASK_DESTINATIONS).toHaveLength(4);
    const hosts = ASK_DESTINATIONS.map((destination) => new URL(destination.url("x")).host);
    expect(new Set(hosts).size).toBe(4);
  });

  it.each(ASK_DESTINATIONS.map((destination) => [destination.name, destination] as const))(
    "%s encodes the question rather than interpolating it",
    (_name, destination) => {
      // An `&` that survives unencoded becomes a second query parameter, and the half of the
      // question after it is silently dropped. A `#` becomes a fragment and never leaves the
      // browser at all.
      const question = "does A & B work? #1 — and what about a=b";
      const url = new URL(destination.url(question));
      const parameter = url.searchParams.get("q");
      expect(parameter, `${url.host} lost the question`).toBe(question);
    }
  );

  it("sends nothing of ours with it", () => {
    // No referrer parameter, no campaign string, no id. The sheet's promise is that the textarea is
    // exactly what will be sent, and a URL that carries anything else makes that untrue.
    for (const destination of ASK_DESTINATIONS) {
      const url = new URL(destination.url("hello"));
      const names = [...url.searchParams.keys()].filter((key) => key !== "q");
      // Google's `udm=50` selects its AI mode; it is part of the destination, not about the reader.
      expect(names.filter((name) => name !== "udm"), `${url.host} adds ${names.join(", ")}`).toEqual([]);
    }
  });
});
