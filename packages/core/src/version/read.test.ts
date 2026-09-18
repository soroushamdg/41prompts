// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { PromptBlok } from "../compile/types.js";
import { readSnapshot, readSnapshotBloks, snapshot } from "./snapshot.js";

/**
 * `readSnapshotBloks` is the other half of `snapshot()`, and these tests are mostly about what it
 * **refuses**.
 *
 * A reader that repairs is worse than one that gives up: a snapshot is a historical claim, nothing
 * later re-checks it, and a field quietly defaulted on read is indistinguishable from a field that
 * was really there. So every malformed shape below asserts `undefined` rather than a best effort.
 */

const bloks: PromptBlok[] = [
  { id: "b1", kind: "context", text: "You route inbound support email.", order: 0 },
  { id: "b2", kind: "constraint", text: "Reply in at most 80 words.", order: 1 },
  { id: "b3", kind: "expected", text: "Respond with valid JSON.", order: 2 },
];

/** A snapshot the way it comes back from `jsonb`: through `JSON.stringify`, which is the real path. */
function stored(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe("readSnapshotBloks", () => {
  it("round-trips what snapshot() wrote, through JSON", () => {
    const frozen = snapshot(bloks);
    const read = readSnapshotBloks(stored(frozen.bloks));
    expect(read).toEqual(frozen.bloks);
  });

  it("carries a hand edit back, both halves of it", () => {
    const frozen = snapshot(bloks, new Map([["b2", { editedText: "Keep it under 40 words.", editedFromHash: "abc" }]]));
    const read = readSnapshotBloks(stored(frozen.bloks));
    expect(read?.[1]?.editedText).toBe("Keep it under 40 words.");
    expect(read?.[1]?.editedFromHash).toBe("abc");
    // The verbatim text is still the blok's own — a hand edit is a span, not a rewrite of the blok.
    expect(read?.[1]?.text).toBe("Reply in at most 80 words.");
  });

  it("reads an empty blok set as an empty array, not as unreadable", () => {
    // A prompt with no bloks is a real state — it is what a new prompt is — and its version is not
    // corrupt. `undefined` here would make the page say the history cannot be read.
    expect(readSnapshotBloks([])).toEqual([]);
  });

  it("keeps a blok whose text is empty", () => {
    // An empty blok is someone's empty blok. Dropping it would silently change the blok count, and
    // then a diff would report a removal nobody made.
    const read = readSnapshotBloks([
      { id: "b1", kind: "context", text: "", position: 0, editedText: null, editedFromHash: null },
    ]);
    expect(read).toHaveLength(1);
    expect(read?.[0]?.text).toBe("");
  });

  describe("refuses rather than repairs", () => {
    const one = { id: "b1", kind: "context", text: "hi", position: 0, editedText: null, editedFromHash: null };

    it("a value that is not an array", () => {
      expect(readSnapshotBloks(undefined)).toBeUndefined();
      expect(readSnapshotBloks(null)).toBeUndefined();
      expect(readSnapshotBloks({ bloks: [one] })).toBeUndefined();
      expect(readSnapshotBloks("[]")).toBeUndefined();
    });

    it("an entry that is not an object", () => {
      expect(readSnapshotBloks([one, null])).toBeUndefined();
      expect(readSnapshotBloks([one, "b2"])).toBeUndefined();
    });

    it("a missing or empty id", () => {
      expect(readSnapshotBloks([{ ...one, id: undefined }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, id: "" }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, id: 41 }])).toBeUndefined();
    });

    it("a kind that is not one of the six", () => {
      // The reason this is checked and not coerced: `diff` and `compile` both type `kind` as
      // `BlokKind`, so letting a seventh through puts a value into them their types deny exists.
      expect(readSnapshotBloks([{ ...one, kind: "role" }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, kind: "" }])).toBeUndefined();
    });

    it("a missing text", () => {
      expect(readSnapshotBloks([{ ...one, text: undefined }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, text: 0 }])).toBeUndefined();
    });

    it("a position that is not a non-negative integer", () => {
      expect(readSnapshotBloks([{ ...one, position: -1 }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, position: 1.5 }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, position: "0" }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, position: undefined }])).toBeUndefined();
    });

    it("half a hand edit", () => {
      // The pair is one fact (`types.ts`). Half of it is not a lenient read; it is a different
      // fact — a hash of nothing, or an edit whose drift can never be answered.
      expect(readSnapshotBloks([{ ...one, editedText: "x", editedFromHash: null }])).toBeUndefined();
      expect(readSnapshotBloks([{ ...one, editedText: null, editedFromHash: "h" }])).toBeUndefined();
    });

    it("does not renumber positions it was handed", () => {
      // Non-contiguous positions are accepted as written and left alone. Re-deriving them would turn
      // a corrupt row into a plausible one, and a diff would then report moves nobody made.
      const read = readSnapshotBloks([
        { ...one, id: "b1", position: 0 },
        { ...one, id: "b2", position: 7 },
      ]);
      expect(read?.map((blok) => blok.position)).toEqual([0, 7]);
    });
  });
});

describe("readSnapshot", () => {
  it("assembles the pair diff() takes", () => {
    const frozen = snapshot(bloks);
    const read = readSnapshot(stored(frozen.bloks), frozen.compiledText);
    expect(read?.compiledText).toBe(frozen.compiledText);
    expect(read?.bloks).toEqual(frozen.bloks);
  });

  it("propagates unreadable, rather than returning a snapshot with no bloks", () => {
    // The difference matters: `{ bloks: [], compiledText }` would diff cleanly against anything and
    // report every blok as added. `undefined` makes the surface say it cannot read the row.
    expect(readSnapshot("not a snapshot", "text")).toBeUndefined();
  });
});
