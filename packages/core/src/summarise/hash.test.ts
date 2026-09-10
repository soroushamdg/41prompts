// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { Blok } from "../cluster/types.js";
import { summaryInputHash } from "./hash.js";

const SOURCE = "Always respond in JSON only.\n\nNever add commentary.";
const blok = (kind: Blok["kind"], ranges: ReadonlyArray<[number, number]>): Blok => ({
  id: "blok_0000000000000000",
  kind,
  ranges: ranges.map(([start, end]) => ({ start, end }))
});

const ONE = blok("constraint", [[0, 28]]);

describe("summaryInputHash", () => {
  it("changes when the blok's text changes", () => {
    const other = `${SOURCE.slice(0, 27)}!`;
    expect(summaryInputHash(ONE, SOURCE, "v1")).not.toBe(summaryInputHash(ONE, other, "v1"));
  });

  it("changes when the summariser version changes", () => {
    // The whole cache-invalidation mechanism: reword the prompt, bump the version, and every
    // summary the old behaviour produced becomes unreachable at once with nothing to purge.
    expect(summaryInputHash(ONE, SOURCE, "v1")).not.toBe(summaryInputHash(ONE, SOURCE, "v2"));
  });

  it("does not change otherwise", () => {
    expect(summaryInputHash(ONE, SOURCE, "v1")).toBe(summaryInputHash(ONE, SOURCE, "v1"));
    expect(summaryInputHash(ONE, SOURCE, "v1")).toBe(summaryInputHash({ ...ONE, id: "blok_ffffffffffffffff" }, SOURCE, "v1"));
  });

  it("changes when the kind changes, because the summary depends on the kind", () => {
    // Decisions 3 and 5 cannot both be read literally. The heuristic prefixes the kind, so a blok
    // reclassified from context to constraint produces a different summary — and a key that did not
    // cover the kind would serve the old one for ever. A cache key covers every input the function
    // reads, or it is not a cache key.
    expect(summaryInputHash(ONE, SOURCE, "v1")).not.toBe(summaryInputHash(blok("context", [[0, 28]]), SOURCE, "v1"));
  });

  it("does not change when the blok moves within the prompt", () => {
    // Deliberate. Moving a rule to a different place in a prompt does not change what it says, and
    // on a canvas where reordering is an ordinary edit, throwing the summary away would make the
    // cache miss constantly.
    const padded = `A preamble that pushes everything along.\n\n${SOURCE}`;
    const moved = blok("constraint", [[42, 70]]);
    expect(padded.slice(42, 70)).toBe(SOURCE.slice(0, 28));
    expect(summaryInputHash(moved, padded, "v1")).toBe(summaryInputHash(ONE, SOURCE, "v1"));
  });

  it("distinguishes two fragment splits of the same characters", () => {
    // Length-prefixed, so ["ab", "c"] and ["a", "bc"] cannot collide.
    const text = "abc";
    const split = blok("context", [[0, 2], [2, 3]]);
    const other = blok("context", [[0, 1], [1, 3]]);
    expect(summaryInputHash(split, text, "v1")).not.toBe(summaryInputHash(other, text, "v1"));
  });

  it("is sixteen hex digits", () => {
    expect(summaryInputHash(ONE, SOURCE, "v1")).toMatch(/^[0-9a-f]{16}$/);
  });
});
