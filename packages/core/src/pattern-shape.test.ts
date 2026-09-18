// SPDX-FileCopyrightText: 2026 41Prompts Inc.
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
  // EPIC-030. Deriving a check's parameters from the blok's verbatim text, and counting words.
  //
  // **Every one is linear, and each for the same structural reason**: a single quantifier over a
  // single character class, with nothing repeated inside anything else repeated. `findNestedQuantifiers`
  // asserts that mechanically in the test below; this note is why it is true rather than lucky.
  //
  // - `\b(\d{1,6})\b` — a bounded run of digits between word boundaries.
  // - the two quote-delimited ones — a bounded negated class between two single-character classes.
  //   `[^\x22\u201D]{1,200}` cannot overlap its delimiters, so there is one way to match any input.
  // - `\bone of\b[^:]{0,30}:?\s*(.+)$` — `[^:]{0,30}` and `.+` are separated by a literal that
  //   neither can contain, so they cannot trade characters with each other.
  // - `\s*(?:,|\bor\b)\s*` — an alternation of two literals with no quantifier on the group.
  // - the trim pattern — two anchored single-character classes, no quantifier at all.
  // - `\s+` in `graders.ts` — `countWords`. Deliberately not `Intl.Segmenter`: that is locale- and
  //   ICU-version-dependent, so the same output could be 79 words on one Node build and 80 on
  //   another, and `grade()` has to answer the same everywhere.
  //
  // **Quote characters are written as escapes** (`\x22`, `\u201C`) rather than literally, because
  // the audit below blanks quoted strings before scanning and a `"` inside a literal comes back
  // mangled. A pattern whose audited form is corrupted is one nobody can review, which defeats the
  // point of this list.
  ["check/graders.ts", "\\s+"],
  ["check/params.ts", "\\b(\\d{1,6})\\b"],
  ["check/params.ts", "[\\x22\\u201C]([^\\x22\\u201D]{1,200})[\\x22\\u201D]"],
  ["check/params.ts", "\\bone of\\b[^:]{0,30}:?\\s*(.+)$"],
  ["check/params.ts", "\\s*(?:,|\\bor\\b)\\s*"],
  ["check/params.ts", "^[\\x22\\u201C\\u2018]|[\\x22\\u201D\\u2019.]$"],
  ["check/params.ts", "[\\x60\\x22\\u201C\\u2018]([A-Za-z_][A-Za-z0-9_]{0,60})[\\x60\\x22\\u201D\\u2019]"],
  ["classify/classify.ts", "^[ \\t]*(?:[-*+\u2022][ \\t]+|\\d{1,9}[.)][ \\t]+)"],
  ["cluster/invariants.ts", "^blok_[0-9a-f]{16}$"],
  // Moved out of cluster.ts in EPIC-012a so the detectors reuse one similarity measure rather than
  // inventing a second — a pair of rules must not be "similar enough to merge" and "not similar
  // enough to report" at the same time.
  ["cluster/similarity.ts", "[^a-z0-9_\\s]"],
  ["cluster/similarity.ts", "\\s+"],
  // EPIC-053. Turning a prompt name and a variable name into an identifier a program can call.
  //
  // **All eight are linear, and none is on a hot path.** Seven have either no quantifier at all or a
  // single quantifier over a single character class, which is the same structural argument the
  // EPIC-030 block above makes. The one worth a sentence of its own is
  // `(\p{Lu}+)(\p{Lu}\p{Ll})` in `snakeCase`: `\p{Lu}+` is a single quantifier followed by two
  // fixed single-character classes, so a failed match backtracks one position at a time and never
  // nests — `findNestedQuantifiers` asserts that mechanically in the test below.
  //
  // **And the input is bounded by something other than this list.** These run over a prompt's
  // *name* and a variable's *name*, not over prompt text: a handful of words, typed into a form,
  // once per prompt when a file is generated. That is a different risk profile from the detectors,
  // which read whatever a stranger pasted into the open decompiler.
  //
  // The Unicode property escapes are deliberate rather than `[a-z]`: a prompt called
  // "Résumé parser" has to produce a legal identifier, and both languages accept non-ASCII letters
  // in one. `\p{Ll}`, `\p{Lu}` and `\p{N}` are what "letter" and "digit" actually mean.
  ["codegen/identifiers.ts", "[^\\p{L}\\p{N}]+"],
  ["codegen/identifiers.ts", "[^\\p{L}\\p{N}]"],
  ["codegen/identifiers.ts", "^\\p{N}"],
  ["codegen/python.ts", "([\\p{Ll}\\p{N}])(\\p{Lu})"],
  ["codegen/python.ts", "(\\p{Lu}+)(\\p{Lu}\\p{Ll})"],
  ["codegen/python.ts", "[^\\p{L}\\p{N}_]"],
  ["codegen/python.ts", "^\\p{N}"],
  // The one ASCII-only pattern here, and it has to be: this decides whether a key needs quoting in
  // a TypeScript object literal, and TypeScript's own unquoted-key grammar is what it is.
  ["codegen/typescript.ts", "^[A-Za-z_$][A-Za-z0-9_$]*$"],
  // EPIC-012a. Both collapse whitespace: one to count words, one to quote a span on a single line
  // inside a finding's message. Single quantifiers over a single class.
  // The scoping conjunctions that turn a negation into a precondition rather than a contradiction.
  // A single alternation of literals, no quantifier at all.
  ["detect/contradiction.ts", "\\b(?:until|unless|before|after|except|while|whenever|once|when|if)\\b"],
  ["detect/shared.ts", "\\s+"],
  ["detect/shared.ts", "\\s+"],
  ["segment/chars.ts", "\\s"],
  ["segment/invariants.ts", "\\s"],
  // EPIC-011b. The first is the same leading-list-marker pattern `classify.ts` uses, for the same
  // reason: a marker is punctuation, not content, and a summary of "2. Set a priority" is a summary
  // of the rule and not of the numeral. The second is the shape of a cache key. Both are single
  // quantifiers over single classes; neither can backtrack.
  ["summarise/contract.ts", "^[0-9a-f]{16}$"],
  // Every character that starts a new line in something. A single class, no quantifier at all.
  ["summarise/contract.ts", "[\\n\\r\\v\\f\\u0085\\u2028\\u2029]"],
  ["summarise/heuristic.ts", "^[ \\t]*(?:[-*+\u2022][ \\t]+|\\d{1,9}[.)][ \\t]+)"],
  // EPIC-022. The brace form, and the name shape on its own.
  //
  // Both are single quantifiers over single classes with no nesting and nothing optional wrapping
  // anything repeated, so neither can backtrack: `\s*` and `[A-Za-z0-9_]*` each have exactly one way
  // to match any given input, and the literal `{{` and `}}` anchor both ends of the first.
  //
  // The name class is deliberately narrower than it could be — no dots, dashes or spaces — because
  // every character allowed here is a character a rename has to survive and a future path syntax
  // (`{{ user.name }}`) would have to reinterpret. Starting narrow is reversible; starting wide is
  // not, because prompts written against the wider syntax would break.
  ["variables/extract.ts", "\\{\\{(\\s*)([A-Za-z_][A-Za-z0-9_]*)\\s*\\}\\}"],
  ["variables/extract.ts", "^[A-Za-z_][A-Za-z0-9_]*$"]
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
