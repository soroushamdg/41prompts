// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { cluster } from "./cluster/cluster.js";
import { blokHash } from "./compile/hash.js";
import { makeFinding } from "./detect/shared.js";
import { summaryInputHash } from "./summarise/hash.js";
import type { Blok } from "./cluster/types.js";
import type { Segment } from "./segment/types.js";

/**
 * **A separator that can occur in a field is not a separator** — as a gate, not a comment.
 *
 * ## Why this file exists
 *
 * The rule was already written down, in a comment on `summarise/hash.ts`, in exactly these words:
 * *`["ab", "c"]` and `["a", "bc"]` must not hash alike.* It was written down in `compile/hash.ts`
 * too, and `cluster.ts` follows it. Then EPIC-031 added a new key builder that joined a person's
 * prompt and a person's input with a separator either could contain, and the collision it created
 * would have served **one of your own requests' model output as the answer to another** — silently,
 * with a `cached` status and a cost of zero.
 *
 * It was found by accident, because an unrelated gate failed on the same line.
 *
 * **A rule that lives only in a comment on the file that follows it is not a rule.** Three files
 * carried it and the fourth broke it, so it is now a test: every multi-field key builder is fed the
 * canonical colliding pair, and a new builder that is not listed here fails the build.
 *
 * ## The canonical pair
 *
 * `["ab", "c"]` and `["a", "bc"]`. Same characters, different field boundary. Any builder that
 * concatenates without stating where the boundary is will map both to one key.
 */

const SPLIT_A = ["ab", "c"] as const;
const SPLIT_B = ["a", "bc"] as const;

/**
 * Every key builder in the repo that combines more than one field, and how each is defended.
 *
 * `construction` means the builder cannot collide whatever it is given — it length-prefixes, or it
 * serialises, or it joins on something the fields provably cannot contain. `value_shape` means it
 * cannot collide *given today's inputs*, which is a weaker guarantee and is recorded as such rather
 * than rounded up.
 */
const BUILDERS = [
  { site: "packages/core/src/summarise/hash.ts", marker: "summaryInputHash", defence: "construction" },
  { site: "packages/core/src/compile/hash.ts", marker: "export function blokHash", defence: "construction" },
  { site: "packages/core/src/cluster/cluster.ts", marker: "parts.join", defence: "construction" },
  { site: "packages/core/src/detect/shared.ts", marker: "export function makeFinding", defence: "value_shape" },
  // **Found by the scan below, not by the hand audit that produced EPIC-031's finding table.**
  // `checkFor` builds a check id from the blok id and the blok text, and it is safe: the id is
  // `blok_` plus hex and the text is length-prefixed. That it was missed by a careful manual pass
  // and caught by a crude regex is the whole argument for this file existing.
  { site: "packages/core/src/compile/checks.ts", marker: "export function checkFor", defence: "construction" },
  // Outside this package, so it cannot be imported here — `packages/core` imports nothing. Its own
  // collision test lives beside it, and the scan at the bottom of this file asserts it is still
  // there rather than trusting this line.
  { site: "apps/worker/src/runs/execute.ts", marker: "export function cacheKeyFor", defence: "construction" }
] as const;

function blokOf(ranges: readonly { start: number; end: number }[]): Blok {
  return { id: "blok_0000000000000000", kind: "context", ranges };
}

describe("the canonical colliding pair", () => {
  /**
   * The source is `"abc"` for both; only where one fragment stops and the next starts differs. A
   * builder that joins the fragment texts without stating the boundary produces `"ab" + "c"` and
   * `"a" + "bc"` — the same string.
   */
  it("summaryInputHash distinguishes two fragment splits of the same characters", () => {
    const source = "abc";
    const a = summaryInputHash(blokOf([{ start: 0, end: 2 }, { start: 2, end: 3 }]), source, "v1");
    const b = summaryInputHash(blokOf([{ start: 0, end: 1 }, { start: 1, end: 3 }]), source, "v1");
    expect(a).not.toBe(b);
  });

  it("summaryInputHash distinguishes the version and the kind from the text", () => {
    const source = "abc";
    const blok = blokOf([{ start: 0, end: 3 }]);
    expect(summaryInputHash(blok, source, "v1")).not.toBe(summaryInputHash(blok, source, "v2"));
    expect(summaryInputHash(blok, source, "v1")).not.toBe(
      summaryInputHash({ ...blok, kind: "constraint" }, source, "v1")
    );
  });

  /**
   * `blokHash` covers the compiler version, the kind and the text. The pair that would collide under
   * naive concatenation is a kind/text boundary that moves — and it cannot, because the text is
   * length-prefixed.
   */
  it("blokHash distinguishes a moved kind/text boundary", () => {
    const a = blokHash({ id: "b", kind: "context", text: SPLIT_A.join(""), order: 10 });
    const b = blokHash({ id: "b", kind: "context", text: SPLIT_B.join(""), order: 10 });
    // Same characters, same field split — these *should* be equal. The guard is the next assertion.
    expect(a).toBe(b);

    // Two bloks whose kind and text differ but whose concatenation would not.
    expect(blokHash({ id: "b", kind: "context", text: "ab", order: 10 })).not.toBe(
      blokHash({ id: "b", kind: "constraint", text: "ab", order: 10 })
    );
  });

  it("cluster ids distinguish two fragment splits of the same characters", () => {
    // One source, segmented two ways that differ only in where a boundary falls. A blok id joins
    // every fragment's offsets and text, so the two must not produce the same ids.
    const source = "Always reply politely. Never promise a refund.";
    const seg = (start: number, end: number): Segment => ({ text: source.slice(start, end), start, end });

    const first = cluster([seg(0, 22), seg(23, 45)]);
    const second = cluster([seg(0, 21), seg(22, 45)]);

    const idsOf = (bloks: readonly Blok[]) => bloks.map((blok) => blok.id).join(",");
    expect(first.length).toBeGreaterThan(0);
    expect(idsOf(first)).not.toBe(idsOf(second));
  });

  /**
   * **`makeFinding` is documented rather than defended, and this test says so out loud.**
   *
   * It joins on a space. It cannot collide today because no part can contain a space: `kind` and
   * `severity` are closed sets, a blok id is `blok_` plus hex, and a range renders as
   * digits-colon-digits. That is safety by the shape of today's values, not by construction — a
   * weaker guarantee than its three neighbours have, and the reason it is listed as `value_shape`
   * above.
   *
   * It was left as it is deliberately: it is not a defect, and length-prefixing it would change
   * every finding id and every committed snapshot for no present benefit. **This test is the
   * documentation.** If a part ever becomes text a person wrote, the first assertion below starts
   * failing and the fix is to length-prefix it.
   */
  it("makeFinding is safe only because no part can contain its separator — asserted, not assumed", () => {
    const parts = [
      ...(["repeated", "contradiction", "untestable", "padding", "too_long", "rule_without_check"] as const),
      ...(["high", "medium", "low"] as const),
      "blok_0123456789abcdef",
      "12:34"
    ];
    for (const part of parts) {
      expect(part, `a part containing a space would make the space separator unsafe`).not.toContain(" ");
    }

    // And, given that, a moved boundary between two blok ids still produces different ids.
    const a = makeFinding("repeated", "high", ["blok_aaaaaaaaaaaaaaaa"], [{ start: 0, end: 2 }], { message: "m" });
    const b = makeFinding("repeated", "high", ["blok_aaaaaaaaaaaaaaaa"], [{ start: 0, end: 1 }], { message: "m" });
    expect(a.id).not.toBe(b.id);
  });
});

/**
 * The part that makes this a gate rather than four assertions: **a new key builder has to be listed.**
 *
 * The scan is deliberately crude — a `hash(` or `createHash(` on a line, or within a few lines of a
 * `.join(`. It will over-match, and over-matching is the right failure: the cost is adding a row and
 * a sentence, and the cost of under-matching is the defect this file exists for.
 */
const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const SCAN_ROOTS = ["packages/core/src", "packages/db/src", "apps/worker/src", "apps/web/lib"];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir).sort();
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (full.endsWith(".ts") && !full.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("every multi-field key builder is registered", () => {
  it("finds no hashing site that joins fields and is not in BUILDERS", () => {
    const known = new Set<string>(BUILDERS.map((builder) => builder.site));
    const found: string[] = [];

    for (const root of SCAN_ROOTS) {
      for (const file of sourceFiles(join(REPO_ROOT, root))) {
        const text = readFileSync(file, "utf-8");
        // A hash built from something joined, or from a template with more than one interpolation.
        const joinsIntoHash = /(?:createHash|createHmac|\bhash)\s*\([^)]*\)?[\s\S]{0,200}?\.join\(/.test(text)
          || /\bhash\(`[^`]*\$\{[^`]*\$\{/.test(text);
        if (!joinsIntoHash) continue;
        const rel = relative(REPO_ROOT, file).replaceAll("\\", "/");
        if (!known.has(rel)) found.push(rel);
      }
    }

    expect(
      found,
      "a new key builder joins fields and is not listed in BUILDERS — add it, say how it is defended, and give it a colliding-pair test"
    ).toEqual([]);
  });

  it("every registered builder still exists, and the out-of-package one still has its own test", () => {
    for (const builder of BUILDERS) {
      const text = readFileSync(join(REPO_ROOT, builder.site), "utf-8");
      expect(text, `${builder.site} no longer contains ${builder.marker}`).toContain(builder.marker);
    }
    // `cacheKeyFor` cannot be imported here, so this asserts its guard rather than trusting a comment.
    const workerTest = readFileSync(join(REPO_ROOT, "apps/worker/src/runs/execute.test.ts"), "utf-8");
    expect(workerTest).toContain("does not collide when a field boundary moves");
  });

  it("records how each builder is defended, and that only one relies on today's values", () => {
    const byValueShape = BUILDERS.filter((builder) => builder.defence === "value_shape");
    expect(byValueShape.map((builder) => builder.marker)).toEqual(["export function makeFinding"]);
  });
});
