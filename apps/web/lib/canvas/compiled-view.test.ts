import { compile, editSpan, type PromptBlok } from "@41prompts/core";
import { describe, expect, it } from "vitest";
import { compiledView, isDrift, spanLabel, SPAN_BADGE, SPAN_SENTENCE, type SpanPresentation } from "./compiled-view";
import { toDisplayText } from "@/lib/site/display-text";

/**
 * **The four text shapes EPIC-013 got wrong twice, built before the pane.**
 *
 * Its report is explicit that a naive `textContent === source.slice(start, end)` passes three of
 * these and fails only CRLF, and that the browser then normalises a `<textarea>` to CRLF on submit
 * so the hard case is the *common* one. Here the compiled text is assembled from blok text stored
 * byte for byte, so CRLF arrives the same way.
 */
const SHAPES: [string, string][] = [
  ["CRLF", "One.\r\nTwo.\r\nThree."],
  ["tabs and trailing space", "\tIndented\tcolumns \nand a trailing space "],
  ["emoji with combining marks and ZWJ", "Ship it 🚀 — Café, é and 👩‍💻 all intact."],
  ["RTL", "مرحبا bidi عربى mixed with Latin."],
];

function blok(id: string, text: string, order: number, kind: PromptBlok["kind"] = "context"): PromptBlok {
  return { id, kind, text, order };
}

describe("offsets map to the DOM for every shape", () => {
  it.each(SHAPES)("a span of %s text covers exactly its blok's characters", (_name, text) => {
    const bloks = [blok("a", "Before.", 10), blok("b", text, 20), blok("c", "After.", 30)];
    const pieces = compiledView(compile(bloks), bloks);

    const piece = pieces.find((candidate) => candidate.blokId === "b")!;
    // In DOM space, which is the only space the assertion can be made in: the parser has already
    // replaced CRLF with LF by the time anything can read `textContent`.
    expect(piece.text).toBe(toDisplayText(text));
    // And it has not eaten its neighbours or the separator.
    expect(piece.text).not.toContain("Before.");
    expect(piece.text).not.toContain("After.");
    expect(piece.separator).toBe("\n\n");
  });

  it.each(SHAPES)("concatenating every piece rebuilds the whole prompt (%s)", (_name, text) => {
    const bloks = [blok("a", "Before.", 10), blok("b", text, 20), blok("c", "After.", 30)];
    const compiled = compile(bloks);
    const rebuilt = compiledView(compiled, bloks)
      .map((piece) => piece.text + piece.separator)
      .join("");
    expect(rebuilt).toBe(toDisplayText(compiled.text));
  });

  it("holds when a blok's own text contains the separator", () => {
    // The span must still be one piece: a blok whose text looks like a boundary is not a boundary.
    const bloks = [blok("a", "Rules:\n\n1. First\n2. Second", 10), blok("b", "After.", 20)];
    const pieces = compiledView(compile(bloks), bloks);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.text).toBe("Rules:\n\n1. First\n2. Second");
  });

  it("skips expected bloks, which emit no text and own no span", () => {
    const bloks = [blok("a", "Context.", 10), blok("e", "Returns JSON.", 20, "expected")];
    const pieces = compiledView(compile(bloks), bloks);
    expect(pieces.map((piece) => piece.blokId)).toEqual(["a"]);
  });
});

describe("the four states, and the fifth that is deliberately silent", () => {
  const FIVE: PromptBlok[] = [
    blok("b1", "You route inbound support email.", 10),
    blok("b2", "Reply in at most 80 words.", 20, "constraint"),
  ];

  function presentationOf(compiledIn: ReturnType<typeof compile>, bloks: PromptBlok[], id: string): SpanPresentation {
    return compiledView(compiledIn, bloks).find((piece) => piece.blokId === id)!.presentation;
  }

  it("1 · in step: a freshly compiled span whose blok has not moved", () => {
    expect(presentationOf(compile(FIVE), FIVE, "b2")).toBe("in-step");
  });

  it("2 · edited by hand, blok unchanged", () => {
    const edited = editSpan(compile(FIVE), "b2", "Reply briefly.");
    expect(presentationOf(edited, FIVE, "b2")).toBe("edited");
  });

  it("3 · edited by hand, and the blok has changed since", () => {
    const edited = editSpan(compile(FIVE), "b2", "Reply briefly.");
    const moved = FIVE.map((b) => (b.id === "b2" ? { ...b, text: "Reply in at most 200 words." } : b));
    expect(presentationOf(edited, moved, "b2")).toBe("edited-changed");
  });

  it("4 · out of date: nobody typed here and the blok changed", () => {
    const moved = FIVE.map((b) => (b.id === "b2" ? { ...b, text: "Reply in at most 200 words." } : b));
    expect(presentationOf(compile(FIVE), moved, "b2")).toBe("out-of-date");
  });

  /**
   * The fifth cell, asserted **as a silence** rather than left to pass unnoticed. A blok whose kind
   * changed and whose text did not has a stale hash and correct text; there is nothing the reader
   * can act on, so the pane says nothing — and this is the test that will notice if that ever stops
   * being deliberate.
   */
  it("5 · a blok whose kind changed but whose text did not says nothing at all", () => {
    const reclassified = FIVE.map((b) => (b.id === "b2" ? { ...b, kind: "context" as const } : b));
    const compiled = compile(FIVE);

    // The premise: the hash moved and the text did not.
    const piece = compiledView(compiled, reclassified).find((p) => p.blokId === "b2")!;
    expect(piece.blokChangedSinceSpan, "premise: the hash should be stale").toBe(true);
    expect(piece.textDiffersFromBlok, "premise: the text should still match").toBe(false);

    expect(piece.presentation).toBe("in-step");
    expect(SPAN_SENTENCE[piece.presentation]).toBe("");
    expect(SPAN_BADGE[piece.presentation]).toBe("");
  });

  /** Criterion: a test fails if two states produce the same text. */
  it("gives the four visible states four distinct sentences and four distinct badges", () => {
    const visible: SpanPresentation[] = ["in-step", "edited", "edited-changed", "out-of-date"];
    const sentences = visible.map((p) => SPAN_SENTENCE[p]);
    const badges = visible.map((p) => SPAN_BADGE[p]);
    expect(new Set(sentences).size).toBe(visible.length);
    expect(new Set(badges).size).toBe(visible.length);
  });

  it("says something for every state a reader can act on, and nothing for the ones they cannot", () => {
    for (const p of ["edited", "edited-changed", "out-of-date"] as const) {
      expect(SPAN_SENTENCE[p].length, `${p} must have a sentence`).toBeGreaterThan(20);
      expect(SPAN_BADGE[p].length, `${p} must have a badge`).toBeGreaterThan(0);
      // Never colour alone: the text is the signal, the colour is at most a reinforcement.
      expect(SPAN_SENTENCE[p]).toContain("Update from blok");
    }
    expect(SPAN_SENTENCE["in-step"]).toBe("");
  });

  /** Amber is drift and only drift. A hand edit whose blok has not moved is a choice, not drift. */
  it("treats only the blok-has-changed states as drift", () => {
    expect(isDrift("edited-changed")).toBe(true);
    expect(isDrift("out-of-date")).toBe(true);
    expect(isDrift("edited")).toBe(false);
    expect(isDrift("in-step")).toBe(false);
  });
});

describe("a span that has no text of its own", () => {
  it("gets an accessible name, because an empty button has none at all", () => {
    // The real state: "Add context" creates a blok before anybody types into it.
    const bloks = [blok("empty", "", 10, "constraint"), blok("b", "After.", 20)];
    const piece = compiledView(compile(bloks), bloks).find((p) => p.blokId === "empty")!;
    expect(piece.text).toBe("");
    expect(spanLabel(piece)).toBe("Empty span for the constraint blok");
  });

  it("gets none when it has text, so the content stays the name a screen reader hears", () => {
    const bloks = [blok("a", "Reply in at most 80 words.", 10, "constraint")];
    const piece = compiledView(compile(bloks), bloks)[0]!;
    expect(spanLabel(piece)).toBeUndefined();
  });

  it("names the multi-word kinds readably", () => {
    const bloks = [blok("i", "", 10, "image_ref")];
    const piece = compiledView(compile(bloks), bloks)[0]!;
    expect(spanLabel(piece)).toBe("Empty span for the image ref blok");
  });
});
