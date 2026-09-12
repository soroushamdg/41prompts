// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { findSegmentFixture } from "../segment/fixtures/index.js";
import { makeRandom } from "../segment/fixtures/generate.js";
import { segment } from "../segment/segment.js";
import { compile } from "./compile.js";
import { COMPILE_FIXTURES, compileFixture } from "./fixtures/prompts.js";
import { BLOK_SEPARATOR } from "./hash.js";
import { checkCompiledInvariants } from "./invariants.js";
import type { PromptBlok, SpanCache } from "./types.js";

/**
 * Generated blok sets, from the shared seeded generator.
 *
 * `makeRandom` rather than `Math.random`, and no `Date` anywhere, so a failing case reproduces from
 * its seed alone on any machine forever — EPIC-010 decision 6, and the reason EPIC-011a could say
 * "seed 41137" and have it mean something a year later.
 */
function generateBloks(seed: number): PromptBlok[] {
  const random = makeRandom(seed);
  const kinds = ["context", "constraint", "example", "expected", "image_ref", "image_input"] as const;
  const words = ["answer", "JSON", "never", "always", "🚀", "café", "مرحبا", "", "\n\n", "rule", "."];

  const count = 1 + Math.floor(random() * 12);
  const bloks: PromptBlok[] = [];
  for (let i = 0; i < count; i++) {
    const length = Math.floor(random() * 6);
    let text = "";
    for (let w = 0; w < length; w++) text += `${words[Math.floor(random() * words.length)]!} `;
    bloks.push({
      id: `b${i}`,
      kind: kinds[Math.floor(random() * kinds.length)]!,
      text: text.trimEnd(),
      // Deliberately collides: a small order space means ties are common, and the tie-break is what
      // keeps a blok set from compiling two ways.
      order: Math.floor(random() * 5) * 10
    });
  }
  return bloks;
}

describe("compile", () => {
  it("emits bloks in `order`, joined by the separator, with the last one separated too", () => {
    const { text } = compile(compileFixture("five-bloks").bloks);
    expect(text.startsWith("You route inbound support email")).toBe(true);
    expect(text.endsWith(BLOK_SEPARATOR)).toBe(true);
    // The expected blok emitted nothing.
    expect(text).not.toContain("Respond with valid JSON containing");
  });

  it("breaks a tie on `order` by id, not by the order the array arrived in", () => {
    const { text, spans } = compile(compileFixture("tied-order").bloks);
    expect(spans.map((span) => span.blokId)).toEqual(["a", "z"]);
    expect(text.startsWith("First, because a sorts before z.")).toBe(true);
  });

  it("rejects two bloks sharing an id, rather than letting the ambiguity surface later", () => {
    const twice: PromptBlok[] = [
      { id: "same", kind: "context", order: 10, text: "one" },
      { id: "same", kind: "context", order: 20, text: "two" }
    ];
    expect(() => compile(twice)).toThrow(/two bloks share the id/);
  });

  describe("the span-tiling invariant", () => {
    it.each(COMPILE_FIXTURES.map((fixture) => [fixture.name, fixture] as const))(
      "holds for the %s fixture",
      (_name, fixture) => {
        expect(checkCompiledInvariants(compile(fixture.bloks), fixture.bloks)).toEqual([]);
      }
    );

    /**
     * Criterion 2: 1,000 generated blok sets. The invariant is the property every later epic depends
     * on silently, so it is checked over generated input rather than over the cases we thought of.
     */
    it("holds over 1,000 generated blok sets", () => {
      for (let seed = 0; seed < 1_000; seed++) {
        const bloks = generateBloks(seed);
        const violations = checkCompiledInvariants(compile(bloks), bloks);
        expect(violations, `seed ${seed}: ${violations.map((v) => v.detail).join("; ")}`).toEqual([]);
      }
    });

    it("holds for the empty blok set, where it holds vacuously", () => {
      const compiled = compile([]);
      expect(compiled).toEqual({ text: "", spans: [], checks: [] });
      expect(checkCompiledInvariants(compiled, [])).toEqual([]);
    });
  });

  describe("the compiler emits blok text verbatim", () => {
    it("puts every blok's text in the output unmodified, over 1,000 generated blok sets", () => {
      for (let seed = 0; seed < 1_000; seed++) {
        const bloks = generateBloks(seed);
        const { text, spans } = compile(bloks);
        for (const blok of bloks) {
          if (blok.kind === "expected") continue;
          const span = spans.find((candidate) => candidate.blokId === blok.id);
          expect(span, `seed ${seed}: blok ${blok.id} has no span`).toBeDefined();
          expect(text.slice(span!.start, span!.textEnd), `seed ${seed}: blok ${blok.id}`).toBe(blok.text);
        }
      }
    });

    it("does not normalise a blok that already contains a separator, or an astral character", () => {
      const { text, spans } = compile(compileFixture("awkward-text").bloks);
      for (const blok of compileFixture("awkward-text").bloks) {
        const span = spans.find((candidate) => candidate.blokId === blok.id)!;
        expect(text.slice(span.start, span.textEnd)).toBe(blok.text);
      }
    });

    /**
     * A multi-range blok from the decompiler folds into one `PromptBlok` and must produce **one**
     * span. The plural is `CLAUDE.md` rule 5 and it is why a rule stated in three places is one
     * thing the user edits once — compiling it into three spans would undo that on the way out.
     */
    it("compiles a multi-range decompiled blok into exactly one span", () => {
      const fixture = findSegmentFixture("repeated-sentence")!;
      const decompiled = cluster(segment(fixture.text));
      const multi = decompiled.find((blok) => blok.ranges.length > 1);
      expect(multi, "the corpus fixture no longer yields a multi-range blok").toBeDefined();

      // The fold EPIC-021a will do: every range's text, joined, becomes one editable blok.
      const folded: PromptBlok = {
        id: multi!.id,
        kind: multi!.kind,
        order: 10,
        text: multi!.ranges.map((range) => fixture.text.slice(range.start, range.end)).join(" ")
      };

      const compiled = compile([folded]);
      expect(compiled.spans).toHaveLength(1);
      expect(compiled.text.slice(compiled.spans[0]!.start, compiled.spans[0]!.textEnd)).toBe(folded.text);
      expect(checkCompiledInvariants(compiled, [folded])).toEqual([]);
    });
  });

  describe("expected bloks", () => {
    it("compiles an all-expected prompt to an empty string plus checks, without throwing", () => {
      const fixture = compileFixture("only-expected");
      const compiled = compile(fixture.bloks);
      expect(compiled.text).toBe("");
      expect(compiled.spans).toEqual([]);
      expect(compiled.checks).toHaveLength(4);
      expect(checkCompiledInvariants(compiled, fixture.bloks)).toEqual([]);
    });

    it("gives every check its blok, its verbatim text, and a kind only when one can be named", () => {
      const compiled = compile(compileFixture("only-expected").bloks);
      const [json, words, secret, tone] = compiled.checks;
      expect(json).toMatchObject({ blokId: "e1", kind: "json_shape", text: "Respond only in JSON." });
      expect(words).toMatchObject({ blokId: "e2", kind: "word_limit" });
      expect(secret).toMatchObject({ blokId: "e3", kind: "must_not_contain" });

      // No shape names this one, and no kind is invented for it. The two ways of manufacturing one
      // — a ninth kind, or a default of `must_contain` — are both worse than saying nothing: the
      // first contradicts ADR-003, the second asserts a substring nobody wrote.
      expect(tone?.kind).toBeUndefined();
      expect(tone?.text).toBe("The tone should feel warm and human.");
      expect(Object.hasOwn(tone!, "kind"), "an absent kind is absent, not present-and-undefined").toBe(false);
    });
  });

  describe("determinism", () => {
    it("produces byte-identical output and hashes over 100 compiles", () => {
      const bloks = compileFixture("five-bloks").bloks;
      const first = JSON.stringify(compile(bloks));
      for (let run = 0; run < 100; run++) {
        expect(JSON.stringify(compile(bloks))).toBe(first);
      }
    });

    it("does not depend on the order the array arrived in", () => {
      const bloks = compileFixture("five-bloks").bloks;
      expect(compile([...bloks].reverse())).toEqual(compile(bloks));
    });
  });

  describe("one blok changes, one span changes", () => {
    /**
     * Criterion 3, and the whole point of per-blok compilation (`CLAUDE.md` rule 4). The evidence is
     * not just "the output differs" — every *other* span must be byte-identical and keep its hash,
     * which is what makes a cached span safe to reuse.
     */
    it("recompiles exactly one span; the others are byte-identical and keep their hashes", () => {
      const before = compile(compileFixture("five-bloks").bloks);
      const after = compile(compileFixture("one-blok-edited").bloks);

      const changed = after.spans.filter((span) => {
        const was = before.spans.find((candidate) => candidate.blokId === span.blokId)!;
        return before.text.slice(was.start, was.textEnd) !== after.text.slice(span.start, span.textEnd);
      });
      expect(changed.map((span) => span.blokId)).toEqual(["b2"]);

      for (const span of after.spans) {
        const was = before.spans.find((candidate) => candidate.blokId === span.blokId)!;
        if (span.blokId === "b2") {
          expect(span.hash).not.toBe(was.hash);
          continue;
        }
        expect(span.hash).toBe(was.hash);
        expect(span.end - span.start).toBe(was.end - was.start);
      }
    });

    it("serves every unchanged span from the cache", () => {
      const cache: SpanCache = new Map();
      compile(compileFixture("five-bloks").bloks, { cache });
      const warm = new Map(cache);

      // One blok's text changed: its hash is new, so it misses; the other three must hit.
      compile(compileFixture("one-blok-edited").bloks, { cache });
      const added = [...cache.keys()].filter((key) => !warm.has(key));
      expect(added).toHaveLength(1);
    });

    it("holds over generated blok sets: changing one blok's text moves one span and no hash but its own", () => {
      for (let seed = 0; seed < 200; seed++) {
        const bloks = generateBloks(seed);
        const target = bloks.find((blok) => blok.kind !== "expected");
        if (target === undefined) continue;

        const before = compile(bloks);
        const after = compile(bloks.map((blok) => (blok.id === target.id ? { ...blok, text: `${blok.text}!` } : blok)));

        for (const span of after.spans) {
          const was = before.spans.find((candidate) => candidate.blokId === span.blokId)!;
          if (span.blokId === target.id) continue;
          expect(span.hash, `seed ${seed}: ${span.blokId}`).toBe(was.hash);
          expect(after.text.slice(span.start, span.textEnd)).toBe(before.text.slice(was.start, was.textEnd));
        }
      }
    });
  });

  describe("reordering", () => {
    /**
     * Criterion 4. `order` is deliberately not in `blokHash`, which is what makes this true rather
     * than nearly true: moving a rule up the canvas does not change what the rule says, so it must
     * not invalidate a single cached span.
     */
    it("changes offsets and nothing else: the same spans, same hashes, same widths", () => {
      const before = compile(compileFixture("five-bloks").bloks);
      const after = compile(compileFixture("reordered").bloks);

      expect(after.spans.map((span) => span.blokId)).toEqual(["b1", "b3", "b2", "b4"]);
      for (const span of after.spans) {
        const was = before.spans.find((candidate) => candidate.blokId === span.blokId)!;
        expect(span.hash).toBe(was.hash);
        expect(span.end - span.start).toBe(was.end - was.start);
        expect(span.textEnd - span.start).toBe(was.textEnd - was.start);
        expect(after.text.slice(span.start, span.textEnd)).toBe(before.text.slice(was.start, was.textEnd));
      }
      expect(after.text.length).toBe(before.text.length);
      expect(after.text).not.toBe(before.text);
    });

    it("reuses every cached span across a reorder", () => {
      const cache: SpanCache = new Map();
      compile(compileFixture("five-bloks").bloks, { cache });
      const size = cache.size;
      compile(compileFixture("reordered").bloks, { cache });
      expect(cache.size).toBe(size);
    });
  });
});
