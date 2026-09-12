// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { checkCompiledInvariants } from "./invariants.js";
import type { Compiled, CompiledSpan, PromptBlok } from "./types.js";

/**
 * **Written and committed before `compile.ts` exists.**
 *
 * The epic and `docs/PROCESS.md` both say to do it in this order, and the git history is the
 * evidence: EPIC-011a's false-merge fixture came before the merge rule, and a property written
 * against a real implementation tends to describe what that implementation happens to do.
 *
 * So every case below is hand-built. There is nothing to call yet.
 */

function span(partial: Partial<CompiledSpan> & Pick<CompiledSpan, "blokId" | "start" | "end">): CompiledSpan {
  return {
    textEnd: partial.end,
    hash: "0".repeat(16),
    state: "compiled",
    ...partial
  };
}

function rules(compiled: Compiled, bloks?: readonly PromptBlok[]): string[] {
  return checkCompiledInvariants(compiled, bloks).map((violation) => violation.rule);
}

const blok = (id: string, text: string, order: number, kind: PromptBlok["kind"] = "context"): PromptBlok => ({
  id,
  kind,
  text,
  order
});

/**
 * The hand-built cases below carry their own separator lengths and are **not** kept in step with
 * `BLOK_SEPARATOR`. Deliberate: the invariant checks the tiling from the offsets it is given and must
 * not assume a separator length. The constant has already been two characters, then one, then two
 * again across three compiler versions; this file did not change with it, and that is the point. If
 * these cases ever get rewritten to match the compiler, the test starts agreeing with the code it is
 * meant to be checking.
 */
describe("the span-tiling invariant", () => {
  it("passes on spans that tile the text exactly", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(checkCompiledInvariants(compiled)).toEqual([]);
  });

  it("catches a gap — a character of the prompt that belongs to no blok", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 4 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(rules(compiled)).toContain("spans-tile-the-text");
    expect(checkCompiledInvariants(compiled)[0]?.detail).toContain("a gap belongs to no blok");
  });

  it("catches an overlap — a character claimed by two bloks", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 6 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(checkCompiledInvariants(compiled)[0]?.detail).toContain("an overlap belongs to two");
  });

  it("catches a first span that does not start at 0", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 1, textEnd: 3, end: 5 })],
      checks: []
    };
    expect(checkCompiledInvariants(compiled)[0]?.detail).toContain("first span starts at 1, not 0");
  });

  it("catches a last span that stops short of the end", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 3, end: 5 })],
      checks: []
    };
    expect(checkCompiledInvariants(compiled)[0]?.detail).toContain("the remainder belongs to no blok");
  });

  it("catches a span running past the end of the text", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 3, end: 99 })],
      checks: []
    };
    expect(rules(compiled)).toContain("offsets-within-the-text");
  });

  it("catches a textEnd outside its own span", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 5, end: 5 }), span({ blokId: "b", start: 5, textEnd: 9, end: 5 })],
      checks: []
    };
    expect(rules(compiled)).toContain("text-then-separator");
  });

  it("catches non-integer offsets before they poison the arithmetic", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 1.5, end: 5 })],
      checks: []
    };
    expect(rules(compiled)).toContain("offsets-are-integers");
  });

  it("catches one blok owning two spans", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "a", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(rules(compiled)).toContain("one-span-per-blok");
  });

  // `"overridden"` on purpose: it is the word ADR-003 rejected in favour of "edited by hand", so it
  // is the most likely wrong value anybody would actually write here.
  it("catches an unknown state", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [{ blokId: "a", start: 0, textEnd: 3, end: 5, hash: "0", state: "overridden" as never }],
      checks: []
    };
    expect(rules(compiled)).toContain("known-state");
  });

  /**
   * The degenerate case, asserted rather than assumed. An empty blok set tiles an empty string
   * vacuously, and a compiler that emitted a stray separator for it would pass every other rule.
   */
  it("holds vacuously for no bloks, and catches text with no spans to own it", () => {
    expect(checkCompiledInvariants({ text: "", spans: [], checks: [] })).toEqual([]);
    expect(rules({ text: "\n\n", spans: [], checks: [] })).toContain("empty-compiles-to-empty");
  });
});

describe("the rules that need the blok set too", () => {
  const bloks = [blok("a", "one", 0), blok("b", "two", 1)];

  it("passes when every emitting blok owns one span carrying its verbatim text", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(checkCompiledInvariants(compiled, bloks)).toEqual([]);
  });

  it("catches a compiled span whose text is not its blok's — a paraphrase reaching the output", () => {
    const compiled: Compiled = {
      text: "1st\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(rules(compiled, bloks)).toContain("a-compiled-span-is-its-bloks-verbatim-text");
  });

  /**
   * A span edited by hand is *supposed* to differ from its blok. That difference is the feature, and
   * `drift()` is what reports it — an invariant that called it a violation would make the product's
   * central behaviour a bug.
   */
  it("does not call a hand-edited span a violation for differing from its blok", () => {
    const compiled: Compiled = {
      text: "ONE\n\ntwo\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5, state: "edited by hand" }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 })
      ],
      checks: []
    };
    expect(checkCompiledInvariants(compiled, bloks)).toEqual([]);
  });

  it("catches an emitting blok with no span", () => {
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 3, end: 5 })],
      checks: []
    };
    expect(rules(compiled, bloks)).toContain("every-emitting-blok-owns-a-span");
  });

  it("catches a span naming a blok that is not there", () => {
    const compiled: Compiled = {
      text: "one\n\ntwo\n\nthree\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "b", start: 5, textEnd: 8, end: 10 }),
        span({ blokId: "gone", start: 10, textEnd: 15, end: 17 })
      ],
      checks: []
    };
    expect(rules(compiled, bloks)).toContain("every-span-names-a-blok");
  });

  it("catches an expected blok that emitted text", () => {
    const withExpected = [blok("a", "one", 0), blok("e", "returns JSON", 1, "expected")];
    const compiled: Compiled = {
      text: "one\n\nreturns JSON\n\n",
      spans: [
        span({ blokId: "a", start: 0, textEnd: 3, end: 5 }),
        span({ blokId: "e", start: 5, textEnd: 17, end: 19 })
      ],
      checks: []
    };
    expect(rules(compiled, withExpected)).toContain("expected-bloks-emit-no-text");
  });

  it("does not require an expected blok to own a span", () => {
    const withExpected = [blok("a", "one", 0), blok("e", "returns JSON", 1, "expected")];
    const compiled: Compiled = {
      text: "one\n\n",
      spans: [span({ blokId: "a", start: 0, textEnd: 3, end: 5 })],
      checks: []
    };
    expect(checkCompiledInvariants(compiled, withExpected)).toEqual([]);
  });

  /**
   * Usable on the compiled prompt alone. EPIC-050 will validate an artifact read back from R2, where
   * the compiled prompt is the whole of what there is and the blok set may be a version away.
   */
  it("checks the tiling with no blok set at all", () => {
    const compiled: Compiled = { text: "one\n\n", spans: [span({ blokId: "a", start: 0, textEnd: 3, end: 5 })], checks: [] };
    expect(checkCompiledInvariants(compiled)).toEqual([]);
  });
});
