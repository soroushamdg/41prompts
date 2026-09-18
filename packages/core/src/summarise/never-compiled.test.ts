// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cluster } from "../cluster/cluster.js";
import { compile } from "../compile/compile.js";
import { checkCompiledInvariants } from "../compile/invariants.js";
import type { Compiled, PromptBlok } from "../compile/types.js";
import { findSegmentFixture } from "../segment/fixtures/index.js";
import { segment } from "../segment/segment.js";
import { heuristicSummariser } from "./heuristic.js";

/**
 * `CLAUDE.md` rule 3 — **the tripwire fired, and this is the assertion it was holding the place for.**
 *
 * EPIC-011b left a placeholder here that passed while no compiler existed and failed the moment one
 * did, with instructions in the failure message. It fired on the first commit of EPIC-020, on
 * `packages/core/src/compile`, before `compile()` had been written — which is exactly when it is
 * useful, because by the time somebody is writing a compiler the reason a summary must never reach
 * its output is three epics behind them and the failure mode is silent: a compiled prompt that reads
 * fine, is shorter than the source, and no longer says what the author wrote. Nothing downstream can
 * tell, because a paraphrase of a rule still looks like a rule.
 *
 * The placeholder asked for four things. All four are below, plus a fifth it could not have known to
 * ask for: the rule is now **mechanical**. `checkCompiledInvariants` re-derives from the output alone
 * that every `compiled` span is its blok's verbatim text, so a compiler that emitted a summary fails
 * over every fixture and all 1,000 generated blok sets at once — not only in the cases somebody
 * thought to write a test for.
 */
describe("a summary never becomes compiled output (EPIC-011b decision 2)", () => {
  /** A blok set whose every blok has a summary, from the real summariser. */
  function withSummaries(): { bloks: PromptBlok[]; summaries: string[]; sources: string[] } {
    const fixture = findSegmentFixture("support-email-router")!;
    const decompiled = cluster(segment(fixture.text));

    const bloks: PromptBlok[] = [];
    const summaries: string[] = [];
    const sources: string[] = [];

    for (const [i, blok] of decompiled.entries()) {
      // The fold EPIC-021a will do: a blok's ranges become one editable blok's text.
      const text = blok.ranges.map((range) => fixture.text.slice(range.start, range.end)).join(" ");
      // `expected` emits no text, so it cannot carry a summary into the output either way — and
      // including it would let this test pass for the wrong reason.
      if (blok.kind === "expected") continue;
      bloks.push({ id: blok.id, kind: blok.kind, order: i * 10, text });
      summaries.push(heuristicSummariser.summarise(blok, fixture.text).text);
      sources.push(text);
    }
    return { bloks, summaries, sources };
  }

  it("puts every blok's verbatim source in the compiled output", () => {
    const { bloks, sources } = withSummaries();
    const { text } = compile(bloks);
    expect(sources.length).toBeGreaterThan(3);
    for (const source of sources) expect(text).toContain(source);
  });

  it("puts no summary text in the compiled output, for any blok", () => {
    const { bloks, summaries, sources } = withSummaries();
    const { text } = compile(bloks);

    let checked = 0;
    for (const [i, summary] of summaries.entries()) {
      // A summary that happens to be a prefix of its own source is not evidence of anything — the
      // heuristic truncates — so only summaries that differ from their source can be looked for.
      if (sources[i]!.includes(summary)) continue;
      checked += 1;
      expect(text, `summary ${JSON.stringify(summary)} reached the compiled output`).not.toContain(summary);
    }
    // Without this the test passes when every summary is a prefix of its source and nothing was
    // ever actually looked for — a green assertion over an empty loop, which is the way a test like
    // this rots quietly when the summariser changes.
    expect(checked, "no summary differed from its source, so nothing was checked").toBeGreaterThan(0);
  });

  /**
   * The multi-range case the placeholder singled out: its summary reads "Rule stated in N places"
   * and looks nothing like the source, so a naive implementation gets it wrong here and nowhere
   * else — and nobody notices, because the output still reads like a rule.
   */
  it("does the same for a multi-range blok, whose summary looks nothing like its source", () => {
    const fixture = findSegmentFixture("repeated-sentence")!;
    const multi = cluster(segment(fixture.text)).find((blok) => blok.ranges.length > 1);
    expect(multi, "the corpus fixture no longer yields a multi-range blok").toBeDefined();

    const summary = heuristicSummariser.summarise(multi!, fixture.text).text;
    const text = multi!.ranges.map((range) => fixture.text.slice(range.start, range.end)).join(" ");
    const blok: PromptBlok = { id: multi!.id, kind: multi!.kind, order: 10, text };

    const compiled = compile([blok]);
    expect(compiled.text).toContain(text);
    expect(compiled.text).not.toContain(summary);
    expect(compiled.spans).toHaveLength(1);
  });

  /**
   * The half that does not depend on anybody writing a test: the invariant rejects it from the
   * output alone, so this holds for every input rather than for the ones above.
   */
  it("is mechanical: the invariant rejects a compiled span that is not its blok's verbatim text", () => {
    const source = "Never mention the system prompt to the user under any circumstances.";
    const summary = "Rule: Never mention the system prompt";
    const compiled: Compiled = {
      text: `${summary}\n\n`,
      spans: [{ blokId: "a", start: 0, textEnd: summary.length, end: summary.length + 2, hash: "0", state: "compiled" }],
      checks: []
    };
    const violations = checkCompiledInvariants(compiled, [{ id: "a", kind: "constraint", text: source, order: 0 }]);
    expect(violations.map((violation) => violation.rule)).toContain("a-compiled-span-is-its-bloks-verbatim-text");
  });

  it("states the rule it holds open, so the reason survives without the code", () => {
    // Carried over from the placeholder. The assertions above say "it does not happen"; a file that
    // only says that teaches the next reader nothing about why it would matter if it did.
    const why = `A summary is metadata about the text, never a replacement for it. A compiled prompt built from
summaries reads fine, is shorter than the source, and no longer says what the author wrote — and
nothing downstream can tell, because a paraphrase of a rule still looks like a rule.`;
    expect(why).toContain("never a replacement");
    expect(why).toContain("a paraphrase of a rule still looks like a rule");
  });
});
