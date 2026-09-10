// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findNestedQuantifiers } from "../pattern-shape.js";
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

/**
 * The fastest run of each of two inputs, measured **interleaved**.
 *
 * Comparing two timings amplifies noise in a way that measuring one does not, and measuring them
 * in two consecutive blocks makes it worse: a burst of contention that lands entirely inside the
 * second block corrupts the comparison even though every individual run was the fastest of
 * several. That is not hypothetical — it turned the growth check below into a 2.48 exponent under
 * `pnpm test`'s eight parallel suites, from a small input at 4.8 ms and a large one at 147.9 ms
 * whose honest reading is a fifth of that.
 *
 * Interleaving means a stall has to hit all `runs` measurements of the same input to survive the
 * minimum, and any uniform slowdown — a slower runner, a busy machine — scales both and cancels
 * out of the ratio entirely.
 */
function fastestInterleaved(first: string, second: string, runs = 5): [number, number] {
  let bestFirst = Number.POSITIVE_INFINITY;
  let bestSecond = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) {
    bestFirst = Math.min(bestFirst, timeSegment(first));
    bestSecond = Math.min(bestSecond, timeSegment(second));
  }
  return [bestFirst, bestSecond];
}

/**
 * A prompt of a given size: the whole corpus repeated, so it exercises every rule rather than one
 * cheap path.
 */
function sizedPrompt(codeUnits: number): string {
  const corpus = SEGMENT_FIXTURES.map((f) => f.text).join("\n\n");
  let input = corpus;
  while (input.length < codeUnits) input += `\n\n${corpus}`;
  return input.slice(0, codeUnits);
}

const ONE_HUNDRED_KILOBYTES = 102_400;
const ONE_MEGABYTE = 1_048_576;

describe("throughput", () => {
  it("segments a 100 KB prompt in under 100 ms", () => {
    // 100 KB is the gate because 100 KB is the size that exists. Real prompts run 1–20 KB, so
    // this is already five times the top of that range; the 1 MB figure this replaced was gating
    // on an input two orders of magnitude past anything a user will paste, and it cost more than
    // it bought — it cleared the bar by between 1.2x and 2.8x depending on which runner GitHub
    // handed us, so it was a coin toss dressed up as a performance requirement.
    const input = sizedPrompt(ONE_HUNDRED_KILOBYTES);

    // Warm, and the fastest of ten. The first call in a process pays for V8 compiling this
    // module's hot loops, and that cost is fixed no matter how big the input is: on CI it is
    // roughly 200 ms on its own, which would swamp a 100 ms bar on any input at all. A cold
    // number here would measure the runner, not the segmenter. Both are printed.
    //
    // Ten runs rather than three because a smaller input needs more of them to reach steady
    // state — each call puts a tenth of the work through the same loops, so the optimiser gets
    // there later in wall-clock terms. Under-warmed, this read 9.3 ms where its steady state is
    // nearer 2 ms, and the difference is most of the headroom the 100 ms bar has on a slow
    // runner. Ten calls over 100 KB is a megabyte of work: cheap enough not to think about.
    const cold = timeSegment(input);
    for (let warmUp = 0; warmUp < 3; warmUp++) timeSegment(input);
    const warm = fastestSegment(input, 10);

    console.log(`100 KB (${input.length} code units): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm`);
    expect(warm, `warm run took ${warm.toFixed(1)} ms`).toBeLessThan(100);
  });

  it("reports the 1 MB timing without gating on it", () => {
    // Reported, never asserted. Worth watching — a change that made this ten times slower would
    // be worth knowing about — but not worth failing a build over, for a size no prompt reaches.
    // The only assertion is the one that is about correctness rather than speed, below.
    const input = sizedPrompt(ONE_MEGABYTE);
    const cold = timeSegment(input);
    timeSegment(input);
    const warm = fastestSegment(input);
    console.log(`1 MB (${input.length} code units): ${cold.toFixed(1)} ms cold, ${warm.toFixed(1)} ms warm (reported, not gated)`);
    expect(warm).toBeGreaterThan(0);
  });

  it("holds every invariant on a 1 MB prompt", () => {
    const input = sizedPrompt(ONE_MEGABYTE);
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
 * throughput on a realistic input is the 100 KB test's job.
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

  it("costs no more per tag than the same document shape without tags", () => {
    // The differential version of the growth check, and the one that actually isolates what this
    // suite is here to protect: the cost of *tag matching*.
    //
    // The absolute exponent below cannot do that on its own. Measuring four shapes shows it is
    // dominated by how many segments come out, not by what the rules did to produce them — one
    // paragraph grows at exponent 0.996 and plain lines at 1.026, while any shape that yields one
    // segment per line sits near 1.15 whether or not a single tag is involved. That floor is
    // per-segment allocation, and `Segment.text` being the verbatim source slice is a ruled
    // decision, so the floor stays.
    //
    // So compare like with like. Both inputs here are the same byte count, the same line count and
    // the same segment count; only one of them has tags in it. If tag matching ever went quadratic
    // — one forward scan per unmatched opener, the shape `tags.ts` uses a stack to avoid — the
    // tagged exponent would climb towards 2.0 while the control stayed where it is, and the
    // difference is what fails. Runner speed and GC pressure move both together and cancel.
    const tagged = (n: number): string => "<a>\n".repeat(n);
    const control = (n: number): string => "# a\n".repeat(n);

    const exponentOf = (make: (n: number) => string): number => {
      const small = make(12_500);
      const large = make(50_000);
      timeSegment(small);
      timeSegment(large);
      const [smallMs, largeMs] = fastestInterleaved(small, large);
      return Math.log(largeMs / Math.max(smallMs, 0.5)) / Math.log(4);
    };

    const taggedExponent = exponentOf(tagged);
    const controlExponent = exponentOf(control);
    const excess = taggedExponent - controlExponent;
    console.log(
      `tag-matching excess ${excess.toFixed(2)} (tagged ${taggedExponent.toFixed(2)}, control ${controlExponent.toFixed(2)})`
    );
    // Quadratic tag matching would put the excess near 0.85. Anything under 0.5 is not that.
    expect(excess, `tags cost input^${excess.toFixed(2)} more than the same shape without them`).toBeLessThan(0.5);
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
    // Both inputs are big enough that a scheduling hiccup cannot dominate, and they are measured
    // interleaved — see `fastestInterleaved`, which exists because this test failed exactly once
    // by measuring them in two blocks.
    const factor = 4;
    const small = "<a>\n".repeat(12_500);
    const large = "<a>\n".repeat(12_500 * factor);

    // Warm the JIT on both shapes first, so the comparison measures the algorithm, not compilation.
    timeSegment(small);
    timeSegment(large);

    const [smallRaw, largeMs] = fastestInterleaved(small, large);
    const smallMs = Math.max(smallRaw, 0.5);
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
//
// The list is down to two. `tags.ts` used to hold the third and now scans by hand — the tag
// grammar is small enough to write out, and writing it out removed an allocation per tag. The
// patterns that decide a *kind* live in committed JSON now and are checked by the same detector
// from `src/pattern-shape.ts`, in `src/cluster/cluster.test.ts`.

const EXPECTED_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ["chars.ts", "\\s"],
  ["invariants.ts", "\\s"]
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
      expect(findNestedQuantifiers(pattern), `${file}: /${pattern}/`).toEqual([]);
    }
  });

  it("detects a nested quantifier when there is one", () => {
    // The detector has to be able to fail, or the test above proves nothing. It now lives in
    // `src/pattern-shape.ts` because EPIC-011a's patterns are committed JSON, which a
    // source-scanning test cannot see.
    expect(findNestedQuantifiers("(a+)+")).toEqual(["(a+)+"]);
    expect(findNestedQuantifiers("(?:[a-z]*)*")).toEqual(["(?:[a-z]*)*"]);
    expect(findNestedQuantifiers("([^<>]*)+")).toEqual(["([^<>]*)+"]);
    expect(findNestedQuantifiers("(\\s*)\\{2,}")).toEqual([]);
    expect(findNestedQuantifiers("([^<>]*)")).toEqual([]);
  });
});
