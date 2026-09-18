// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import type { PromptBlok } from "../compile/types.js";
import { snapshot } from "./snapshot.js";

/**
 * `docs/roadmap.md`'s Review line for EPIC-040: *"Snapshot size at 100 × 50 acceptable."*
 *
 * That question cannot be answered without a number, so this measures one and prints it. It is a
 * **report, not a gate**, for the reason `docs/PROCESS.md` gives under "Three timing gates report
 * rather than enforce": an absolute budget asserted here would either be so loose it catches
 * nothing or so tight it fails on a corpus nobody has seen yet. What it does assert is the shape of
 * the growth — a snapshot is linear in the text it holds, which is the property that makes 100 × 50
 * predictable from 10 × 5.
 *
 * The one hard assertion is the ceiling, and it is deliberately generous: anything that made a
 * snapshot super-linear in its bloks would blow it by orders of magnitude, and nothing that keeps
 * the design honest gets near it.
 */

/** A blok of roughly the size real ones are: `packages/core`'s committed corpus averages ~180 chars. */
const PARAGRAPH =
  "Never promise a refund or a specific delivery date. Say that a human will confirm it, " +
  "and give the customer the reference number from the input so they can follow it up themselves.";

function promptOf(blokCount: number): PromptBlok[] {
  return Array.from({ length: blokCount }, (_, index) => ({
    id: `b${index}`,
    kind: index % 4 === 3 ? ("expected" as const) : ("constraint" as const),
    order: index * 10,
    text: `${PARAGRAPH} (${index})`,
  }));
}

/** What a row would cost in Postgres: the `jsonb` snapshot plus the compiled text beside it. */
function storedBytes(blokCount: number): number {
  const frozen = snapshot(promptOf(blokCount));
  return Buffer.byteLength(JSON.stringify(frozen.bloks), "utf-8")
    + Buffer.byteLength(frozen.compiledText, "utf-8");
}

describe("snapshot size at the roadmap's 100 x 50", () => {
  it("reports what 50 versions of a 100-blok prompt costs", () => {
    const one = storedBytes(100);
    const fifty = one * 50;

    // eslint-disable-next-line no-console -- the measurement is the point; the roadmap asks for it.
    console.log(
      `snapshot size: 100 bloks = ${(one / 1024).toFixed(1)} KiB per version, ` +
        `x50 versions = ${(fifty / 1024 / 1024).toFixed(2)} MiB per prompt`,
    );

    // A prompt is one person's document. Tens of MiB would be a design problem; single-digit MiB is
    // an ordinary row set. The bar is loose on purpose — see the comment at the top.
    expect(fifty).toBeLessThan(64 * 1024 * 1024);
  });

  it("grows linearly in the number of bloks, which is what makes the number above extrapolate", () => {
    const ten = storedBytes(10);
    const hundred = storedBytes(100);

    // Ten times the bloks, close to ten times the bytes. The slack covers the ids and the JSON
    // punctuation, which are per-blok constants rather than growth.
    const ratio = hundred / ten;
    // eslint-disable-next-line no-console -- reported alongside the size, for the same reason.
    console.log(`snapshot growth: 10 -> 100 bloks is x${ratio.toFixed(2)}`);
    expect(ratio).toBeGreaterThan(8);
    expect(ratio).toBeLessThan(12);
  });

  it("does not store a blok's text twice over when nothing is hand-edited", () => {
    // `compiledText` is the bloks' own text joined, so a snapshot is inherently about twice its
    // prose — once verbatim per blok, once compiled. That is the price of not recompiling history
    // and it is stated here so nobody discovers it as a surprise. Three times would mean a bug.
    const frozen = snapshot(promptOf(20));
    const prose = frozen.bloks.reduce((sum, blok) => sum + blok.text.length, 0);
    expect(Buffer.byteLength(JSON.stringify(frozen.bloks)) + frozen.compiledText.length).toBeLessThan(prose * 3);
  });
});
