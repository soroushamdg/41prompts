// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SEGMENT_FIXTURES } from "./fixtures/index.js";
import { checkSegmentInvariants } from "./invariants.js";
import { segment } from "./segment.js";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Milliseconds for one `segment()` call, measured on a monotonic clock. */
function timeSegment(input: string): number {
  const started = performance.now();
  const found = segment(input);
  const elapsed = performance.now() - started;
  // Touch the result so a future engine cannot optimise the call away.
  expect(found.length).toBeGreaterThanOrEqual(0);
  return elapsed;
}

/**
 * The fastest of several runs.
 *
 * Every timing assertion below uses this rather than a single measurement, because a single
 * measurement on a shared runner is not a measurement of this code. `pnpm test` runs eight
 * packages' suites at once and CI runs on whatever `ubuntu-latest` gives it; one of these tests
 * failed exactly once that way, at 100-something milliseconds, having passed at a tenth of that
 * moments earlier. The question these tests exist to answer is "can this input be segmented in
 * under 100 ms", and a run stolen by another process is not evidence against it — while a real
 * regression, or catastrophic backtracking, is slow in *every* run and the minimum catches it
 * just as well as the mean.
 */
function fastestSegment(input: string, runs = 3): number {
  let best = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) best = Math.min(best, timeSegment(input));
  return best;
}

/** A realistic megabyte: the whole corpus repeated, so it exercises every rule, not one cheap path. */
function oneMegabyte(): string {
  const corpus = SEGMENT_FIXTURES.map((f) => f.text).join("\n\n");
  let input = corpus;
  while (input.length < 1_048_576) input += `\n\n${corpus}`;
  return input.slice(0, 1_048_576);
}

describe("throughput", () => {
  it("segments a 1 MB prompt in under 200 ms", () => {
    const input = oneMegabyte();

    // Two numbers, because they answer different questions and only one of them is a useful
    // regression signal. The first call in a process pays for V8 compiling this module's hot
    // loops, and on a CI runner that dominates everything the algorithm does: 493 ms cold
    // against 169 ms warm on `ubuntu-latest`, where this laptop reads 57 ms and 19 ms.
    // Asserting on the cold number would make this test a thermometer for the runner.
    //
    // So the warm call carries the epic's 200 ms bar, and the cold call gets a ceiling whose
    // only job is to notice a hang. That ceiling was 500 ms, picked off a laptop measurement,
    // and CI came in at 492.6 — a gate with 1.5% of headroom, which is a red build waiting for
    // a slightly busier runner rather than a real signal. A hang is orders of magnitude, so the
    // ceiling should be too.
    const cold = timeSegment(input);
    timeSegment(input);
    const warm = fastestSegment(input);

    console.log(`1 MB (${input.length} code units): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
    expect(warm, `warm run took ${warm.toFixed(1)} ms`).toBeLessThan(200);
    expect(cold, `cold run took ${cold.toFixed(1)} ms`).toBeLessThan(2_000);
  });

  it("holds every invariant on that same 1 MB prompt", () => {
    const input = oneMegabyte();
    expect(checkSegmentInvariants(input, segment(input))).toEqual([]);
  });
});

/**
 * Adversarial inputs, each aimed at a specific way this module could go non-linear: regex
 * backtracking in the tag tokenizer, a rescan-per-line fence search, and the one that is not a
 * regex problem at all — matching every unmatched opener by scanning forward for its closer,
 * which is O(n²) and is why `tags.ts` matches with a stack instead.
 *
 * Sizes are chosen so the *slowest* of them takes a few milliseconds on a developer machine,
 * which is what leaves the 100 ms bar real headroom on a shared runner. Two rounds of CI say why
 * that margin has to be generous: four of these first arrived at 130–180 ms having taken 20–37 ms
 * locally, and after resizing, two consecutive green runs on different runners disagreed with
 * each other by about a factor of two (169 ms against 85 ms on the same 1 MB input). A gate whose
 * headroom is thinner than the variance between two runners is a coin toss, not a test.
 *
 * Shrinking them costs nothing this suite was measuring. What blows up on a hostile shape blows
 * up exponentially, so it is just as visible at 6,000 repetitions as at 50,000; whether the cost
 * *grows* with input is the growth-exponent test's job, and an exponent is scale-free. Raw
 * throughput on a big realistic input is the 1 MB test's job, and it passes.
 */
const ADVERSARIAL: ReadonlyArray<readonly [string, string]> = [
  ["6,000 unmatched tag openers", "<a>\n".repeat(6_000)],
  ["6,000 unmatched closing tags", "</a>\n".repeat(6_000)],
  ["6,000 alternating open and close on one line", "<a></a>".repeat(6_000)],
  ["a 25,000-character run of `<`", "<".repeat(25_000)],
  ["an unterminated tag followed by 25,000 characters", `<a ${"b".repeat(25_000)}`],
  ["25,000 characters of attributes with no closing bracket", `<a ${"x=y ".repeat(6_250)}`],
  ["a 25,000-character backtick run", "`".repeat(25_000)],
  ["5,000 fence openers", "```\n".repeat(5_000)],
  ["5,000 tilde fences that never close", "~~~x\n".repeat(5_000)],
  ["a 25,000-character hash run", "#".repeat(25_000)],
  ["10,000 heading lines", "# h\n".repeat(10_000)],
  ["10,000 list markers", "- \n".repeat(10_000)],
  ["1,250 deeply indented list items", `${" ".repeat(60)}- x\n`.repeat(1_250)],
  ["20,000 sentence terminators", ". ".repeat(20_000)],
  ["25,000 terminators with no whitespace", ".".repeat(25_000)],
  ["a 50,000-character run of spaces", " ".repeat(50_000)],
  ["a 50,000-character run of tabs", "\t".repeat(50_000)],
  ["25,000 empty CRLF lines", "\r\n".repeat(25_000)],
  ["a 25,000-character run of digits and dots", "1.".repeat(12_500)],
  ["25,000 lone surrogates", "\uD800".repeat(25_000)]
];

describe("adversarial input", () => {
  it("keeps every adversarial input inside one budget", () => {
    // The 100 ms bar only means something if the inputs are a comparable size. An input three
    // times bigger than its neighbours that takes 110 ms is not evidence of backtracking, it is
    // evidence of being three times bigger — and a test that fails for that reason teaches the
    // next reader nothing. 128 KB keeps the slowest case in single-digit milliseconds locally.
    for (const [name, input] of ADVERSARIAL) {
      expect(input.length, `${name} is ${input.length} code units`).toBeLessThanOrEqual(131_072);
    }
  });

  const measured: Array<{ name: string; elapsed: number }> = [];

  it.each(ADVERSARIAL.map(([name, input]) => ({ name, input })))("survives $name in under 100 ms", ({ name, input }) => {
    const elapsed = fastestSegment(input);
    measured.push({ name, elapsed });
    expect(elapsed, `fastest of three runs took ${elapsed.toFixed(1)} ms`).toBeLessThan(100);
  });

  it("reports the slowest adversarial cases and the headroom left", () => {
    // Printed on every run, including CI. Sizing these against a 100 ms bar was guesswork once,
    // and CI is where the guess was wrong; a number in the log means the next person tightening
    // this suite can see how much room is actually left rather than finding out from a red build.
    const slowest = [...measured].sort((a, b) => b.elapsed - a.elapsed).slice(0, 3);
    for (const { name, elapsed } of slowest) {
      console.log(`adversarial: ${elapsed.toFixed(1).padStart(6)} ms  (${(100 / elapsed).toFixed(1)}x headroom)  ${name}`);
    }
    expect(measured).toHaveLength(ADVERSARIAL.length);
  });

  it("grows no faster than input^1.6 when an adversarial input grows four times larger", () => {
    // The timing tests above catch a hang. This catches the thing that would not hang on a test
    // input but would on a user's: quadratic growth. Matching unmatched tag openers by scanning
    // forward for each one is O(n²) — which is why `tags.ts` matches with a single stack pass.
    //
    // Stated as the growth exponent rather than a raw ratio, because the exponent is the thing
    // anyone actually wants to know and it reads the same on any machine: 1.0 is linear, 2.0 is
    // quadratic, and the forward-scan implementation this replaced would sit at 2.0. Measured
    // 1.16 here and 1.32 on CI. A raw ratio needs a bar that means nothing on its own ("under
    // 8×"?) and quietly changes meaning if the 4× ever becomes 3× or 5×.
    //
    // Both inputs are big enough that a scheduling hiccup cannot dominate, and both go through
    // `fastestSegment`, because a growth figure built from two noisy samples is a coin toss.
    const factor = 4;
    const small = "<a>\n".repeat(12_500);
    const large = "<a>\n".repeat(12_500 * factor);

    // Warm the JIT on both shapes first, so the comparison measures the algorithm, not compilation.
    timeSegment(small);
    timeSegment(large);

    const smallMs = Math.max(fastestSegment(small), 0.5);
    const largeMs = fastestSegment(large);
    const exponent = Math.log(largeMs / smallMs) / Math.log(factor);
    console.log(
      `growth exponent ${exponent.toFixed(2)} (${smallMs.toFixed(1)} ms -> ${largeMs.toFixed(1)} ms for ${factor}x input; 1.0 linear, 2.0 quadratic)`
    );
    expect(exponent, `grew as input^${exponent.toFixed(2)}`).toBeLessThan(1.6);
  });
});

// ── Decision 7 as a failing test, not a review comment ───────────────────────────────────────
//
// "Nested quantifiers over the same character class are a build failure." A timing test alone
// cannot prove that, because catastrophic backtracking needs the *right* input and the next
// person to add a regex will not think of it. So the module's patterns are enumerated here: a
// new one fails this test until it is added to the list, which forces the thought.

const EXPECTED_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ["chars.ts", "\\s"],
  ["invariants.ts", "\\s"],
  ["tags.ts", "<(/?)([A-Za-z][A-Za-z0-9._:-]*)([^<>]*)>"]
];

function moduleSources(): Array<{ file: string; source: string }> {
  return readdirSync(HERE)
    .filter((entry) => entry.endsWith(".ts") && !entry.endsWith(".test.ts"))
    .sort()
    .map((file) => ({ file, source: readFileSync(join(HERE, file), "utf-8") }));
}

/** Regex literals plus the string constants this module hands to `new RegExp`. */
function patternsIn(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ");
  const literals = withoutComments.match(/(?<![*/\w)\]])\/(?:\\.|\[(?:\\.|[^\]])*\]|[^/\\\n])+\/[dgimsuvy]*/g) ?? [];
  const named = withoutComments.match(/_PATTERN\s*=\s*"((?:\\.|[^"\\])*)"/g) ?? [];
  return [
    ...literals.map((literal) => literal.slice(1, literal.lastIndexOf("/"))),
    ...named.map((declaration) => declaration.slice(declaration.indexOf('"') + 1, -1))
  ];
}

/**
 * The `(X+)+` shape: a group that is itself quantified and whose body already contains a
 * quantifier. That is the structure behind every catastrophic-backtracking incident, and it is
 * detectable without running anything.
 */
function nestedQuantifiers(pattern: string): string[] {
  const found: string[] = [];
  const groups = pattern.match(/\((?:\?[:=!<]{1,2})?(?:\\.|[^()\\])*\)[*+?]|\((?:\?[:=!<]{1,2})?(?:\\.|[^()\\])*\)\{/g) ?? [];
  for (const group of groups) {
    const body = group.slice(group.indexOf("(") + 1, group.lastIndexOf(")"));
    const bodyWithoutEscapes = body.replace(/\\./g, "");
    if (/[*+]|\{\d+,/.test(bodyWithoutEscapes)) found.push(group);
  }
  return found;
}

describe("regex safety (epic decision 7)", () => {
  it("uses only the patterns on the reviewed list", () => {
    const actual = moduleSources().flatMap(({ file, source }) =>
      patternsIn(source).map((pattern) => [file, pattern] as const)
    );
    // A new regex in this module is a decision, not an implementation detail: add it here and
    // say in the same commit why it is linear.
    expect(actual).toEqual(EXPECTED_PATTERNS);
  });

  it("has no nested quantifier in any of them", () => {
    for (const [file, pattern] of EXPECTED_PATTERNS) {
      expect(nestedQuantifiers(pattern), `${file}: /${pattern}/`).toEqual([]);
    }
  });

  it("detects a nested quantifier when there is one", () => {
    // The detector has to be able to fail, or the test above proves nothing.
    expect(nestedQuantifiers("(a+)+")).toEqual(["(a+)+"]);
    expect(nestedQuantifiers("(?:[a-z]*)*")).toEqual(["(?:[a-z]*)*"]);
    expect(nestedQuantifiers("([^<>]*)+")).toEqual(["([^<>]*)+"]);
    expect(nestedQuantifiers("(\\s*)\\{2,}")).toEqual([]);
    expect(nestedQuantifiers("([^<>]*)")).toEqual([]);
  });
});
