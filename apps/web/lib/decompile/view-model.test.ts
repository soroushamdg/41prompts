import { cluster, detect, segment } from "@41prompts/core";
import { findSegmentFixture, generatePrompt, NAMED_EDGE_CASES, SEGMENT_FIXTURES } from "@41prompts/core/fixtures";
import { describe, expect, it } from "vitest";
import { buildPieces, groupBloksByKind, toDisplayText, type BlokView } from "./view-model";

/**
 * The four shapes the epic names, drawn from the EPIC-010 corpus rather than written here — a
 * fixture written to match the code it tests proves nothing. These are the prompts EPIC-010 committed
 * precisely because their bytes are awkward.
 */
const REQUIRED_SHAPES = ["crlf-line-endings", "tab-indented", "emoji-and-combining", "right-to-left"] as const;

function piecesFor(text: string) {
  return buildPieces(cluster(segment(text)), text);
}

describe("toDisplayText", () => {
  it("replaces CRLF and a lone CR with LF, and touches nothing else", () => {
    expect(toDisplayText("One.\r\nTwo.\r\n")).toBe("One.\nTwo.\n");
    expect(toDisplayText("One.\rTwo.")).toBe("One.\nTwo.");
    expect(toDisplayText("One.\n\rTwo.")).toBe("One.\n\nTwo.");
  });

  it("leaves every other awkward character exactly as it found it", () => {
    // Measured, not assumed: each of these survives the HTML parser untouched, so normalising them
    // would be the bug rather than the fix.
    for (const text of [
      "\tindented\t\tdeep",
      "See 🙂 and é and é and 👩‍👩‍👧",
      "1. أجب دائماً بصيغة JSON فقط.",
      "﻿starts with a byte-order mark",
      "before \uD800 after",
      "  leading and trailing  ",
      "a b"
    ]) {
      expect(toDisplayText(text)).toBe(text);
    }
  });

  it("removes exactly the carriage returns and no other character", () => {
    for (const fixture of SEGMENT_FIXTURES) {
      const display = toDisplayText(fixture.text);
      const carriageReturns = (fixture.text.match(/\r/g) ?? []).length;
      const crlfPairs = (fixture.text.match(/\r\n/g) ?? []).length;
      // A lone `\r` becomes `\n` (length unchanged); a `\r\n` collapses to `\n` (one shorter).
      expect(display.length, fixture.name).toBe(fixture.text.length - crlfPairs);
      expect(display).not.toContain("\r");
      expect(fixture.text.replace(/\r\n?/g, "\n"), fixture.name).toBe(display);
      expect(carriageReturns).toBeGreaterThanOrEqual(crlfPairs);
    }
  });
});

describe("the source map's pieces", () => {
  it.each(REQUIRED_SHAPES.map((name) => ({ name })))(
    "maps every range to exactly its own characters in $name",
    ({ name }) => {
      // The acceptance criterion, in DOM space: what the span will contain is exactly what the
      // range covers, once the one documented normalisation is applied.
      const fixture = findSegmentFixture(name)!;
      const pieces = piecesFor(fixture.text);
      const spans = pieces.filter((piece) => piece.kind === "span");
      expect(spans.length, `${name} produced no spans`).toBeGreaterThan(0);
      for (const span of spans) {
        if (span.kind !== "span") continue;
        expect(span.text, `${name} ${span.start}..${span.end}`).toBe(
          toDisplayText(fixture.text.slice(span.start, span.end))
        );
      }
    }
  );

  it.each(REQUIRED_SHAPES.map((name) => ({ name })))("reconstructs $name exactly from its pieces", ({ name }) => {
    const fixture = findSegmentFixture(name)!;
    expect(piecesFor(fixture.text).map((piece) => piece.text).join("")).toBe(toDisplayText(fixture.text));
  });

  it("reconstructs every corpus prompt, every named edge case and 500 generated inputs", () => {
    // The invariant the highlight rests on. If the pieces do not reconstruct the document, some
    // character is being dropped or duplicated, and every highlight after it points at the wrong
    // text — the exact failure this epic was warned about.
    const inputs = [
      ...SEGMENT_FIXTURES.map((fixture) => ({ name: fixture.name, text: fixture.text })),
      ...NAMED_EDGE_CASES.map(([name, text]) => ({ name, text })),
      ...Array.from({ length: 500 }, (_, i) => ({ name: `seed-${43_000 + i}`, text: generatePrompt(43_000 + i) }))
    ];
    for (const input of inputs) {
      const pieces = piecesFor(input.text);
      expect(pieces.map((piece) => piece.text).join(""), input.name).toBe(toDisplayText(input.text));
    }
  });

  it("never emits a span whose text is empty or whose offsets run backwards", () => {
    for (const fixture of SEGMENT_FIXTURES) {
      for (const piece of piecesFor(fixture.text)) {
        if (piece.kind !== "span") continue;
        expect(piece.end, fixture.name).toBeGreaterThan(piece.start);
        expect(piece.end, fixture.name).toBeLessThanOrEqual(fixture.text.length);
        expect(piece.text.length, fixture.name).toBeGreaterThan(0);
      }
    }
  });

  it("numbers a multi-range blok's fragments 1..n in source order", () => {
    const fixture = findSegmentFixture("repeated-sentence")!;
    const spans = piecesFor(fixture.text).filter((piece) => piece.kind === "span");
    const byBlok = new Map<string, { index: number; count: number; start: number }[]>();
    for (const span of spans) {
      if (span.kind !== "span") continue;
      const list = byBlok.get(span.blokId) ?? [];
      list.push({ index: span.fragmentIndex, count: span.fragmentCount, start: span.start });
      byBlok.set(span.blokId, list);
    }
    const multi = [...byBlok.values()].filter((list) => list.length > 1);
    expect(multi.length, "the fixture must contain a multi-range blok").toBeGreaterThan(0);
    for (const list of multi) {
      expect(list.map((f) => f.index)).toEqual(list.map((_, i) => i + 1));
      expect(new Set(list.map((f) => f.count))).toEqual(new Set([list.length]));
      expect([...list].sort((a, b) => a.start - b.start)).toEqual(list);
    }
  });

  it("produces no span at all for text nothing owns", () => {
    for (const text of ["", "   ", "\n\n\t\n"]) {
      const pieces = buildPieces(cluster(segment(text)), text);
      expect(pieces.filter((piece) => piece.kind === "span")).toEqual([]);
      expect(pieces.map((piece) => piece.text).join("")).toBe(toDisplayText(text));
    }
  });

  it("drops an overlapping range rather than emitting its characters twice", () => {
    // `buildPieces` is handed whatever a caller has; two ranges covering the same characters would
    // duplicate text into the DOM and shift every highlight after it. Synthetic, because clustering
    // cannot produce it — which is exactly why it needs a test rather than a comment.
    const source = "Always respond in JSON only.";
    const pieces = buildPieces(
      [
        { id: "blok_a", kind: "constraint", ranges: [{ start: 0, end: 20 }] },
        { id: "blok_b", kind: "constraint", ranges: [{ start: 10, end: 28 }] }
      ],
      source
    );
    expect(pieces.map((piece) => piece.text).join("")).toBe(source);
  });
});

describe("the whole pipeline, end to end on the corpus", () => {
  it("holds the reconstruction invariant with findings computed too", () => {
    // Guards against a future change that lets `detect()` influence what the map renders.
    for (const fixture of SEGMENT_FIXTURES) {
      const bloks = cluster(segment(fixture.text));
      detect(bloks, fixture.text);
      expect(buildPieces(bloks, fixture.text).map((piece) => piece.text).join(""), fixture.name).toBe(
        toDisplayText(fixture.text)
      );
    }
  });
});

describe("grouping bloks by kind", () => {
  const blok = (id: string, kind: BlokView["kind"]): BlokView => ({
    id,
    kind,
    summary: id,
    summarySource: "rule",
    rangeCount: 1,
    words: 3
  });

  it("orders groups by BLOK_KINDS, not by first appearance", () => {
    const groups = groupBloksByKind([
      blok("a", "expected"),
      blok("b", "context"),
      blok("c", "image_input"),
      blok("d", "constraint")
    ]);
    expect(groups.map((group) => group.kind)).toEqual(["context", "constraint", "expected", "image_input"]);
  });

  it("omits a kind with no bloks rather than rendering it empty", () => {
    const groups = groupBloksByKind([blok("a", "context"), blok("b", "context")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.kind).toBe("context");
    expect(groups[0]!.bloks).toHaveLength(2);
  });

  it("keeps source order inside a group", () => {
    // A group is a filter over the canvas, not a re-sort of it — the reader can still find a blok by
    // where it was in their prompt.
    const groups = groupBloksByKind([
      blok("first", "constraint"),
      blok("other", "context"),
      blok("second", "constraint"),
      blok("third", "constraint")
    ]);
    const constraints = groups.find((group) => group.kind === "constraint")!;
    expect(constraints.bloks.map((b) => b.id)).toEqual(["first", "second", "third"]);
  });

  it("loses no blok, whatever the corpus throws at it", () => {
    for (const fixture of SEGMENT_FIXTURES) {
      const bloks = cluster(segment(fixture.text)).map((b, i) => blok(`b${i}`, b.kind));
      const grouped = groupBloksByKind(bloks).flatMap((group) => group.bloks);
      expect(grouped, fixture.name).toHaveLength(bloks.length);
      expect(new Set(grouped.map((b) => b.id)).size, fixture.name).toBe(bloks.length);
    }
  });

  it("returns nothing for no bloks", () => {
    expect(groupBloksByKind([])).toEqual([]);
  });
});
