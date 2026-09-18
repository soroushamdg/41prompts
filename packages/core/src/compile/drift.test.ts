// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compile } from "./compile.js";
import { drift } from "./drift.js";
import { BLOK_SEPARATOR } from "./hash.js";
import { editSpan } from "./edit-span.js";
import { compileFixture } from "./fixtures/prompts.js";
import { checkCompiledInvariants } from "./invariants.js";
import { updateFromBlok } from "./update-from-blok.js";
import type { PromptBlok, SpanDrift } from "./types.js";

const FIVE = compileFixture("five-bloks").bloks;

function forBlok(report: { spans: readonly SpanDrift[] }, blokId: string): SpanDrift {
  const found = report.spans.find((span) => span.blokId === blokId);
  if (found === undefined) throw new Error(`no drift row for ${blokId}`);
  return found;
}

const withText = (bloks: readonly PromptBlok[], id: string, text: string): PromptBlok[] =>
  bloks.map((blok) => (blok.id === id ? { ...blok, text } : blok));

describe("drift reports two facts, and they are two facts", () => {
  it("says nothing is stale when nothing has happened", () => {
    const report = drift(compile(FIVE), FIVE);
    expect(report.spans.every((span) => !span.textDiffersFromBlok && !span.blokChangedSinceSpan)).toBe(true);
    expect(report.addedBlokIds).toEqual([]);
    expect(report.removedBlokIds).toEqual([]);
  });

  /**
   * Criterion 5, first of the two named tests.
   *
   * A span edited by hand differs from what its blok compiles to — that is the edit. The blok itself
   * has not moved, and the report must say so, because "edited by hand" and "out of date" are
   * different badges.
   */
  it("a span edited by hand differs from its blok, while the blok has not changed", () => {
    const edited = editSpan(compile(FIVE), "b2", "Reply in at most 60 words, and be direct.");
    const row = forBlok(drift(edited, FIVE), "b2");

    expect(row.state).toBe("edited by hand");
    expect(row.textDiffersFromBlok).toBe(true);
    expect(row.blokChangedSinceSpan).toBe(false);

    // And no other span is touched by somebody editing this one.
    for (const other of drift(edited, FIVE).spans.filter((span) => span.blokId !== "b2")) {
      expect(other.textDiffersFromBlok).toBe(false);
      expect(other.blokChangedSinceSpan).toBe(false);
    }
  });

  /**
   * Criterion 5, second of the two named tests — and the one the epic says is easiest to blur.
   *
   * The person edited the span, and *then* the blok changed underneath them. Both facts are now
   * true, and they are different sentences: "you changed this" and "the blok has changed since you
   * changed it". A model with one flag would show one of them and silently drop the other.
   */
  it("the blok changed after the edit, which is a different fact from the text differing", () => {
    const edited = editSpan(compile(FIVE), "b2", "Reply in at most 60 words, and be direct.");
    const movedOn = withText(FIVE, "b2", "Reply in at most 200 words.");

    const before = forBlok(drift(edited, FIVE), "b2");
    const after = forBlok(drift(edited, movedOn), "b2");

    // The span did not change between these two calls. Only the blok did.
    expect(before.textDiffersFromBlok).toBe(true);
    expect(after.textDiffersFromBlok).toBe(true);

    expect(before.blokChangedSinceSpan).toBe(false);
    expect(after.blokChangedSinceSpan).toBe(true);

    expect(after.state).toBe("edited by hand");
  });

  /**
   * The case that rules out collapsing the two into one flag.
   *
   * A blok reclassified `context` → `constraint` with its text untouched: `blokHash` covers the kind
   * so the hash moves, `render` is identity on text so the output is byte-identical. A model keyed
   * on "does the text still match" calls this in sync and hands back a cached span addressed by a
   * hash that no longer exists.
   */
  it("a blok whose kind changed has a stale hash and identical text — the fourth cell", () => {
    const compiled = compile(FIVE);
    const reclassified = compileFixture("kind-changed-only").bloks;

    expect(compile(reclassified).text).toBe(compiled.text);

    const row = forBlok(drift(compiled, reclassified), "b1");
    expect(row.textDiffersFromBlok).toBe(false);
    expect(row.blokChangedSinceSpan).toBe(true);
    expect(row.state).toBe("compiled");
  });

  it("a compiled span whose blok's text changed reports both, and is a different row from an edited one", () => {
    const compiled = compile(FIVE);
    const movedOn = withText(FIVE, "b2", "Reply in at most 200 words.");
    const row = forBlok(drift(compiled, movedOn), "b2");

    expect(row.state).toBe("compiled");
    expect(row.textDiffersFromBlok).toBe(true);
    expect(row.blokChangedSinceSpan).toBe(true);

    // Same two booleans as the edited-then-moved-on case above, different `state`. That is why the
    // state is in the report: the booleans alone cannot separate "this is out of date" from "you
    // changed this and the blok has since changed too".
    const edited = editSpan(compiled, "b2", "something else entirely");
    const editedRow = forBlok(drift(edited, movedOn), "b2");
    expect([editedRow.textDiffersFromBlok, editedRow.blokChangedSinceSpan]).toEqual([
      row.textDiffersFromBlok,
      row.blokChangedSinceSpan
    ]);
    expect(editedRow.state).not.toBe(row.state);
  });

  it("reports a blok added since the compile, and one deleted since, without throwing", () => {
    const compiled = compile(FIVE);

    const added: PromptBlok[] = [...FIVE, { id: "b9", kind: "constraint", order: 60, text: "Always sign off." }];
    expect(drift(compiled, added).addedBlokIds).toEqual(["b9"]);

    const deleted = FIVE.filter((blok) => blok.id !== "b3");
    expect(drift(compiled, deleted).removedBlokIds).toEqual(["b3"]);
    expect(drift(compiled, deleted).spans.map((span) => span.blokId)).not.toContain("b3");
  });

  it("does not list expected bloks as missing spans, because they legitimately have none", () => {
    // b5 is `expected`. A report that listed every expected blok as added would be noise people
    // learn to skip past, and then they skip past the real ones too.
    expect(drift(compile(FIVE), FIVE).addedBlokIds).toEqual([]);
  });

  it("reports a blok that has become expected as differing, since it now compiles to nothing", () => {
    const compiled = compile(FIVE);
    const nowExpected = FIVE.map((blok) => (blok.id === "b2" ? { ...blok, kind: "expected" as const } : blok));
    const row = forBlok(drift(compiled, nowExpected), "b2");
    expect(row.textDiffersFromBlok).toBe(true);
    expect(row.blokChangedSinceSpan).toBe(true);
  });

  /**
   * Criterion 7. Pure means the same input gives the same answer, and nothing here reads a clock, a
   * global, or the filesystem — so this is a check that no memo, cache or lazily-initialised module
   * state has been added since.
   */
  it("is pure: 100 calls on the same input return identical reports", () => {
    const compiled = editSpan(compile(FIVE), "b2", "hand written");
    const first = JSON.stringify(drift(compiled, FIVE));
    for (let run = 0; run < 100; run++) {
      expect(JSON.stringify(drift(compiled, FIVE))).toBe(first);
    }
  });

  it("is pure: it does not mutate the compiled prompt or the blok set it is given", () => {
    const compiled = compile(FIVE);
    const snapshot = JSON.stringify({ compiled, bloks: FIVE });
    drift(compiled, withText(FIVE, "b2", "changed"));
    expect(JSON.stringify({ compiled, bloks: FIVE })).toBe(snapshot);
  });
});

describe("editSpan", () => {
  it("replaces the blok's text, keeps the separator, and shifts only the offsets after it", () => {
    const before = compile(FIVE);
    const after = editSpan(before, "b2", "Reply briefly.");

    const span = after.spans.find((candidate) => candidate.blokId === "b2")!;
    expect(after.text.slice(span.start, span.textEnd)).toBe("Reply briefly.");
    expect(after.text.slice(span.textEnd, span.end)).toBe(BLOK_SEPARATOR);
    expect(checkCompiledInvariants(after)).toEqual([]);

    // Everything before it is untouched, everything after it has moved by the delta and nothing else.
    const delta = "Reply briefly.".length - "Reply in at most 80 words.".length;
    for (const [i, other] of after.spans.entries()) {
      const was = before.spans[i]!;
      if (other.blokId === "b2") continue;
      const shift = was.start < span.start ? 0 : delta;
      expect(other.start).toBe(was.start + shift);
      expect(other.hash).toBe(was.hash);
      expect(other.state).toBe("compiled");
      expect(after.text.slice(other.start, other.textEnd)).toBe(before.text.slice(was.start, was.textEnd));
    }
  });

  it("keeps the hash the span was compiled from — the whole mechanism behind the second fact", () => {
    const before = compile(FIVE);
    const was = before.spans.find((span) => span.blokId === "b2")!;
    const after = editSpan(before, "b2", "totally different");
    expect(after.spans.find((span) => span.blokId === "b2")!.hash).toBe(was.hash);
  });

  it("accepts an empty edit, and the tiling still holds", () => {
    const after = editSpan(compile(FIVE), "b2", "");
    expect(checkCompiledInvariants(after)).toEqual([]);
    const span = after.spans.find((candidate) => candidate.blokId === "b2")!;
    expect(span.start).toBe(span.textEnd);
  });

  it("does not mutate the compiled prompt it is given", () => {
    const before = compile(FIVE);
    const snapshot = JSON.stringify(before);
    editSpan(before, "b2", "changed");
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("throws on a blok with no span, rather than quietly returning the input", () => {
    expect(() => editSpan(compile(FIVE), "b5", "x")).toThrow(/no span for blok "b5"/);
    expect(() => editSpan(compile(FIVE), "nope", "x")).toThrow(/no span for blok "nope"/);
  });
});

describe("updateFromBlok", () => {
  /**
   * Criterion 6. "Nothing else moves" means no other span's **text, hash or state** changes; later
   * offsets necessarily shift when this span's length does, which is true of any edit to a string.
   */
  it("returns exactly that span to compiled and touches no other span's text, hash or state", () => {
    const compiled = editSpan(compile(FIVE), "b2", "hand written, and much longer than the blok");
    const movedOn = withText(FIVE, "b2", "Reply in at most 120 words.");

    const updated = updateFromBlok(compiled, movedOn, "b2");
    const span = updated.spans.find((candidate) => candidate.blokId === "b2")!;

    expect(span.state).toBe("compiled");
    expect(updated.text.slice(span.start, span.textEnd)).toBe("Reply in at most 120 words.");
    expect(checkCompiledInvariants(updated, movedOn)).toEqual([]);

    for (const other of updated.spans.filter((candidate) => candidate.blokId !== "b2")) {
      const was = compiled.spans.find((candidate) => candidate.blokId === other.blokId)!;
      expect(other.hash).toBe(was.hash);
      expect(other.state).toBe(was.state);
      expect(updated.text.slice(other.start, other.textEnd)).toBe(compiled.text.slice(was.start, was.textEnd));
    }
  });

  it("leaves the span with no drift at all afterwards — both facts false", () => {
    const compiled = editSpan(compile(FIVE), "b2", "hand written");
    const movedOn = withText(FIVE, "b2", "Reply in at most 120 words.");
    const row = forBlok(drift(updateFromBlok(compiled, movedOn, "b2"), movedOn), "b2");
    expect([row.state, row.textDiffersFromBlok, row.blokChangedSinceSpan]).toEqual(["compiled", false, false]);
  });

  it("is the only way back: it replaces what was typed rather than merging it", () => {
    const compiled = editSpan(compile(FIVE), "b2", "a sentence a person wrote and cares about");
    const updated = updateFromBlok(compiled, FIVE, "b2");
    expect(updated.text).not.toContain("a person wrote");
    expect(updated.text).toContain("Reply in at most 80 words.");
  });

  it("does not mutate the compiled prompt it is given", () => {
    const compiled = editSpan(compile(FIVE), "b2", "changed");
    const snapshot = JSON.stringify(compiled);
    updateFromBlok(compiled, FIVE, "b2");
    expect(JSON.stringify(compiled)).toBe(snapshot);
  });

  it("throws rather than guessing when there is nothing to update from", () => {
    const compiled = compile(FIVE);
    expect(() => updateFromBlok(compiled, FIVE, "b5")).toThrow(/no span for blok "b5"/);
    expect(() => updateFromBlok(compiled, FIVE.filter((blok) => blok.id !== "b2"), "b2")).toThrow(
      /is not in this blok set/
    );
    const nowExpected = FIVE.map((blok) => (blok.id === "b2" ? { ...blok, kind: "expected" as const } : blok));
    expect(() => updateFromBlok(compiled, nowExpected, "b2")).toThrow(/that is a compile, not an update/);
  });
});
