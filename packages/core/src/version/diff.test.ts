// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { compileFixture } from "../compile/fixtures/prompts.js";
import type { PromptBlok } from "../compile/types.js";
import { diff } from "./diff.js";
import { snapshot } from "./snapshot.js";

const FIVE = compileFixture("five-bloks").bloks;

const withText = (bloks: readonly PromptBlok[], id: string, text: string): PromptBlok[] =>
  bloks.map((blok) => (blok.id === id ? { ...blok, text } : blok));

const withOrder = (bloks: readonly PromptBlok[], id: string, order: number): PromptBlok[] =>
  bloks.map((blok) => (blok.id === id ? { ...blok, order } : blok));

const without = (bloks: readonly PromptBlok[], id: string): PromptBlok[] =>
  bloks.filter((blok) => blok.id !== id);

describe("diff says what a person changed", () => {
  it("says nothing when nothing happened", () => {
    const result = diff(snapshot(FIVE), snapshot(FIVE));
    expect(result.isEmpty).toBe(true);
    expect(result).toMatchObject({ added: [], removed: [], changed: [], moved: [] });
    expect(result.compiledByteDelta).toBe(0);
  });

  it("reports a rewritten blok as changed, carrying both texts", () => {
    const result = diff(snapshot(FIVE), snapshot(withText(FIVE, "b2", "Reply in at most 40 words.")));

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({
      blokId: "b2",
      before: "Reply in at most 80 words.",
      after: "Reply in at most 40 words.",
    });
    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.moved).toEqual([]);
    expect(result.isEmpty).toBe(false);
  });

  it("reports an added blok once, and as an addition only", () => {
    const extra: PromptBlok = { id: "b6", kind: "constraint", order: 60, text: "Never quote a price." };
    const result = diff(snapshot(FIVE), snapshot([...FIVE, extra]));

    expect(result.added).toHaveLength(1);
    expect(result.added[0]).toMatchObject({ blokId: "b6", position: 5, kind: "constraint" });
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.moved).toEqual([]);
  });

  it("reports a removed blok, and the bloks after it are not reported as moved by its absence", () => {
    // b1 goes, so b2..b5 all shift down one ordinal. That is the removal's consequence, not four
    // separate decisions a person made, and a history that listed four moves here would be noise.
    const result = diff(snapshot(FIVE), snapshot(without(FIVE, "b1")));

    expect(result.removed).toHaveLength(1);
    expect(result.removed[0]).toMatchObject({ blokId: "b1", position: 0 });
    expect(result.added).toEqual([]);
    expect(result.changed).toEqual([]);
    expect(result.moved.map((move) => move.blokId).sort()).toEqual(["b2", "b3", "b4", "b5"]);
  });
});

/**
 * `docs/roadmap.md`'s named test for this epic, and the reason `diff` matches by id.
 *
 * A text-matching diff sees text at a position where it was not before and text missing from where
 * it was, and can only call that a removal plus an addition — telling its reader they deleted and
 * retyped a paragraph they actually dragged. This is the fixture that fails if anyone ever
 * "improves" the matcher into a similarity heuristic.
 */
describe("a move is a move", () => {
  it("reports one move and no removal or addition when a blok is dragged", () => {
    // b4 moves from fourth to first: order 40 -> 5, ahead of b1's 10.
    const result = diff(snapshot(FIVE), snapshot(withOrder(FIVE, "b4", 5)));

    expect(result.added).toEqual([]);
    expect(result.removed).toEqual([]);
    expect(result.changed).toEqual([]);

    const dragged = result.moved.find((move) => move.blokId === "b4");
    expect(dragged).toMatchObject({ from: 3, to: 0 });
    // The three it jumped over each shift down one. Reported, because each one's neighbours changed.
    expect(result.moved).toHaveLength(4);
  });

  it("never reports the same blok as both removed and added", () => {
    const result = diff(snapshot(FIVE), snapshot(withOrder(FIVE, "b4", 5)));
    const addedIds = new Set(result.added.map((blok) => blok.blokId));
    for (const removed of result.removed) expect(addedIds.has(removed.blokId)).toBe(false);
  });

  it("puts a blok that was rewritten and moved in both lists, because that is two facts", () => {
    const edited = withText(FIVE, "b4", 'Input: "refund please"\nOutput: {"category":"refund"}');
    const result = diff(snapshot(FIVE), snapshot(withOrder(edited, "b4", 5)));

    expect(result.changed.map((change) => change.blokId)).toContain("b4");
    expect(result.moved.map((move) => move.blokId)).toContain("b4");
  });
});

describe("a reclassified blok is a change, not a move", () => {
  it("reports the kind it had as well as the kind it has", () => {
    // Same text, same place, different kind — and the compiled output changes, because `expected`
    // emits a check and nothing else while `constraint` emits its text.
    const reclassified = FIVE.map((blok) =>
      blok.id === "b5" ? { ...blok, kind: "constraint" as const } : blok,
    );
    const result = diff(snapshot(FIVE), snapshot(reclassified));

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0]).toMatchObject({
      blokId: "b5",
      previousKind: "expected",
      kind: "constraint",
    });
    expect(result.changed[0]?.before).toBe(result.changed[0]?.after);
    expect(result.moved).toEqual([]);
    expect(result.compiledByteDelta).toBeGreaterThan(0);
  });
});

describe("the compiled byte delta is bytes", () => {
  it("counts a multi-byte character as the bytes it encodes to, not as one", () => {
    const one: PromptBlok[] = [{ id: "x", kind: "context", order: 10, text: "a" }];
    const other: PromptBlok[] = [{ id: "x", kind: "context", order: 10, text: "é" }];

    // One UTF-16 code unit either way; one byte against two. A prompt author asking "how much
    // bigger is what we send" is asking about bytes.
    expect(one[0]?.text.length).toBe(other[0]?.text.length);
    expect(diff(snapshot(one), snapshot(other)).compiledByteDelta).toBe(1);
  });

  it("counts an astral character as four bytes rather than as two surrogates", () => {
    const one: PromptBlok[] = [{ id: "x", kind: "context", order: 10, text: "" }];
    const other: PromptBlok[] = [{ id: "x", kind: "context", order: 10, text: "🙂" }];
    expect(diff(snapshot(one), snapshot(other)).compiledByteDelta).toBe(4);
  });

  it("is negative when the prompt got shorter", () => {
    expect(diff(snapshot(FIVE), snapshot(without(FIVE, "b3"))).compiledByteDelta).toBeLessThan(0);
  });
});

describe("snapshot freezes what a version has to remember", () => {
  it("assigns contiguous ordinals from zero, in compile order", () => {
    const frozen = snapshot(FIVE);
    expect(frozen.bloks.map((blok) => blok.position)).toEqual([0, 1, 2, 3, 4]);
    expect(frozen.bloks.map((blok) => blok.id)).toEqual(["b1", "b2", "b3", "b4", "b5"]);
  });

  it("keeps the hand edit, because restoring without it restores a state nobody had", () => {
    const edits = new Map([["b2", { editedText: "Keep it under 40 words.", editedFromHash: "h1" }]]);
    const frozen = snapshot(FIVE, edits);

    const edited = frozen.bloks.find((blok) => blok.id === "b2");
    expect(edited).toMatchObject({ editedText: "Keep it under 40 words.", editedFromHash: "h1" });
    expect(frozen.bloks.find((blok) => blok.id === "b1")?.editedText).toBeNull();
  });

  it("does not let the ordering the caller happened to pass in decide anything", () => {
    const shuffled = [...FIVE].reverse();
    expect(snapshot(shuffled)).toEqual(snapshot(FIVE));
  });

  it("compiles the hand edit through, so compiledText is what a run would send", () => {
    // The two halves of a snapshot must describe one prompt. Recording the edit in `bloks` while
    // compiling without it would produce a version whose compiled text is not what ran, and whose
    // hash therefore cannot be checked against the run pinned to it.
    const edits = new Map([["b2", { editedText: "Keep it under 40 words.", editedFromHash: "h1" }]]);
    const frozen = snapshot(FIVE, edits);

    expect(frozen.compiledText).toContain("Keep it under 40 words.");
    expect(frozen.compiledText).not.toContain("Reply in at most 80 words.");
    // And the blok's own verbatim text is still what the person wrote, untouched by the edit.
    expect(frozen.bloks.find((blok) => blok.id === "b2")?.text).toBe("Reply in at most 80 words.");
  });

  it("stores the compiled text rather than leaving it to be recomputed later", () => {
    // A version is a historical claim. Recompiling it under a future COMPILER_VERSION would change
    // what it says happened, which is the one thing history may not do.
    expect(snapshot(FIVE).compiledText).toContain("You route inbound support email");
  });
});
