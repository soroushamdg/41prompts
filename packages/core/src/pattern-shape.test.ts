// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { heuristicPatterns } from "./classify/classify.js";
import { clusterPatterns } from "./cluster/cluster.js";
import { checkPattern, findNestedQuantifiers } from "./pattern-shape.js";

const SRC = dirname(fileURLToPath(import.meta.url));

describe("findNestedQuantifiers", () => {
  it("flags the textbook catastrophic shapes", () => {
    expect(findNestedQuantifiers("(a+)+")).toEqual(["(a+)+"]);
    expect(findNestedQuantifiers("(a+)*")).toEqual(["(a+)*"]);
    expect(findNestedQuantifiers("(?:[a-z]*)*")).toEqual(["(?:[a-z]*)*"]);
    expect(findNestedQuantifiers("([^<>]*)+")).toEqual(["([^<>]*)+"]);
    expect(findNestedQuantifiers("(a+){2,}")).toEqual(["(a+){2,}"]);
  });

  it("flags the two shapes the regex-based detector missed", () => {
    // Both found in self-review. A regular expression matching group bodies with `[^()\\]*` cannot
    // see a group inside a group, and cannot survive a `)` inside a character class — so both of
    // these went straight through a gate whose only job was to stop them.
    expect(findNestedQuantifiers("((a|b)+)+")).toEqual(["((a|b)+)+"]);
    expect(findNestedQuantifiers("([a-z)]+)+")).toEqual(["([a-z)]+)+"]);
  });

  it("flags every level of a multiply nested shape", () => {
    expect(findNestedQuantifiers("((a+)+)+")).toEqual(["(a+)+", "((a+)+)+"]);
    // A quantifier inside an unquantified wrapper still counts against the wrapper's own quantifier.
    expect(findNestedQuantifiers("((a+))+")).toEqual(["((a+))+"]);
  });

  it("leaves safe patterns alone", () => {
    expect(findNestedQuantifiers("([^<>]*)")).toEqual([]);
    expect(findNestedQuantifiers("(\\s*)\\{2,}")).toEqual([]);
    expect(findNestedQuantifiers("\\s")).toEqual([]);
    expect(findNestedQuantifiers("^(?:you are|you're|act as)\\b")).toEqual([]);
    expect(findNestedQuantifiers("[ \\t]*(?:[-*+]|\\d{1,9}[.)])[ \\t]+")).toEqual([]);
    // Bounded quantifiers on a quantified group cannot blow up.
    expect(findNestedQuantifiers("(a+)?")).toEqual([]);
    expect(findNestedQuantifiers("(a+){2,3}")).toEqual([]);
    // A `{` that is not a quantifier is a literal brace.
    expect(findNestedQuantifiers("(a+){x}")).toEqual([]);
    // `(` and `)` inside a character class are ordinary characters.
    expect(findNestedQuantifiers("[()]+")).toEqual([]);
    // An escaped paren is data, not a group.
    expect(findNestedQuantifiers("\\(a+\\)+")).toEqual([]);
  });

  it("agrees with reality on the lazy variants", () => {
    expect(findNestedQuantifiers("(a+?)+?")).toEqual(["(a+?)+?"]);
  });
});

describe("checkPattern", () => {
  it("reports a pattern that does not compile, and nothing else", () => {
    const defects = checkPattern("(unclosed");
    expect(defects).toHaveLength(1);
    expect(defects[0]!.rule).toBe("compiles");
  });

  it("reports a nested quantifier in a pattern that does compile", () => {
    expect(checkPattern("(a+)+").map((d) => d.rule)).toEqual(["no-nested-quantifier"]);
  });

  it("passes a pattern that is fit to ship", () => {
    expect(checkPattern("\\b(?:json only|only json)\\b", "i")).toEqual([]);
  });
});

// ── Decision 7 as a failing test, not a review comment ───────────────────────────────────────
//
// EPIC-010 stated it: "nested quantifiers over the same character class are a build failure". A
// timing test cannot prove that, because catastrophic backtracking needs the *right* input and the
// next person adding a pattern will not think of it. So every pattern in the package is enumerated
// here — literals in the source, and the strings in the committed JSON — and a new one fails until
// it is added to the list, which forces the thought.
//
// This used to scan `src/segment` only, which meant every literal in `classify/` and `cluster/` was
// unaudited by the test that claimed to force it. Found in self-review.

const EXPECTED_LITERALS: ReadonlyArray<readonly [string, string]> = [
  ["classify/classify.ts", "^[ \\t]*(?:[-*+\u2022][ \\t]+|\\d{1,9}[.)][ \\t]+)"],
  ["cluster/cluster.ts", "[^a-z0-9_\\s]"],
  ["cluster/cluster.ts", "\\s+"],
  ["cluster/invariants.ts", "^blok_[0-9a-f]{16}$"],
  ["segment/chars.ts", "\\s"],
  ["segment/invariants.ts", "\\s"],
  // EPIC-011b. The first is the same leading-list-marker pattern `classify.ts` uses, for the same
  // reason: a marker is punctuation, not content, and a summary of "2. Set a priority" is a summary
  // of the rule and not of the numeral. The second is the shape of a cache key. Both are single
  // quantifiers over single classes; neither can backtrack.
  ["summarise/contract.ts", "^[0-9a-f]{16}$"],
  ["summarise/heuristic.ts", "^[ \\t]*(?:[-*+\u2022][ \\t]+|\\d{1,9}[.)][ \\t]+)"]
];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry !== "snapshots") out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Regex literals in a source file, with comments and quoted strings blanked out first.
 *
 * Blanking strings matters more than it sounds: without it, the `/classify/` inside an import path
 * like `"../classify/classify.js"` reads as a regex literal, and the audit came back with 34
 * "patterns" of which 29 were module paths. Template literals are left alone, because blanking them
 * could hide a real pattern inside an interpolation — the audit should err towards seeing too much.
 */
function literalsIn(source: string): string[] {
  const blanked = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  const literals = blanked.match(/(?<![*/\w)\]])\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/[dgimsuvy]*/g) ?? [];
  return literals.map((literal) => literal.slice(1, literal.lastIndexOf("/")));
}

describe("every pattern in the package (EPIC-010 decision 7)", () => {
  it("uses only the source literals on the reviewed list", () => {
    const actual = sourceFiles(SRC).flatMap((file) =>
      literalsIn(readFileSync(file, "utf-8")).map(
        (pattern) => [relative(SRC, file).replaceAll("\\", "/"), pattern] as const
      )
    );
    // A new regex literal in this package is a decision, not an implementation detail: add it here
    // and say in the same commit why it is linear. `pattern-shape.ts` is exempt — its own literals
    // are the ones doing the auditing, and listing them here would be circular.
    expect(actual.filter(([file]) => file !== "pattern-shape.ts")).toEqual(EXPECTED_LITERALS);
  });

  it("has no nested quantifier in any source literal, including its own", () => {
    for (const file of sourceFiles(SRC)) {
      for (const pattern of literalsIn(readFileSync(file, "utf-8"))) {
        expect(findNestedQuantifiers(pattern), `${relative(SRC, file)}: /${pattern}/`).toEqual([]);
      }
    }
  });

  it("compiles every committed data pattern and rejects nested quantifiers", () => {
    const defects: string[] = [];
    for (const { id, pattern, flags } of [...heuristicPatterns(), ...clusterPatterns()]) {
      for (const defect of checkPattern(pattern, flags)) defects.push(`${id}: ${defect.rule} — ${defect.detail}`);
    }
    expect(defects).toEqual([]);
  });
});
