// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

// Shared measurement for the throughput and growth tests.
//
// **Test support, not public surface.** Nothing here is exported from `index.ts`; it lives in `src`
// for the same reason the fixture corpus does — it is real shared code and a second copy per package
// directory would drift.

/**
 * How many times each side of a ratio is measured. **The number that fixes the flake, and the reason
 * the bars did not move.**
 *
 * A growth gate compares a small input against a large one. The estimator takes the *minimum* of
 * several runs per side, which is the right statistic for this noise: contention can only ever make a
 * measurement **slower**, never faster, so the minimum converges on the true time from above and a
 * regression — which is slow in every run — survives it.
 *
 * Five runs was too few, and specifically too few for the *large* input: it does four times the work
 * and is therefore about four times likelier to be descheduled mid-run, so on a busy runner it can
 * fail to get a single clean measurement while the small input gets several. The ratio then inflates
 * even though nothing about the code changed. That is exactly what CI saw — 1.74 against a 1.6 bar,
 * twice — and what a quiet machine never shows.
 *
 * Measured rather than guessed. All 8 cores saturated with busy loops, 12–15 trials per row:
 *
 * | runs | 2× oversubscribed: max (trials ≥ 1.6) | 4× oversubscribed: max (trials ≥ 1.6) |
 * |---|---|---|
 * | 5 (before) | **1.968 (4/15)** | — |
 * | 15 | 1.703 (2/15) | — |
 * | **30** | 1.371 (0/15) | 1.492 (0/12) |
 * | 50 | — | 1.410 (0/12) |
 *
 * Thirty is the smallest count that was clean at both contention levels. **If this ever flakes again
 * the answer is to demote the gate to a reported number, not to widen the bar** — a bar that moves
 * whenever it is inconvenient is not a bar, and the thing it guards (quadratic tag matching, which
 * this codebase had) is invisible to the absolute timing gates: quadratic at 100 KB is around 57 ms,
 * comfortably inside the 100 ms limit.
 */
export const RATIO_RUNS = 30;

/**
 * The run count for a gate whose individual measurements are already **tens of milliseconds**.
 *
 * Robustness here is not about the number of samples in the abstract, it is about how big a stolen
 * scheduling slice is *relative to one run*. `segment`'s small input takes about 3.6 ms, so a 10 ms
 * steal is a 280% error and thirty samples are needed to find a clean one. `detect`'s small input
 * takes about 30 ms and its large one about 200 ms, so the same steal is a 33% error on one side and
 * 5% on the other — an order of magnitude less sensitive, and ten samples buy the same confidence at
 * a fraction of the cost.
 *
 * The cost is not theoretical: at thirty runs the `detect` gate took 7.8 s and blew vitest's default
 * timeout, which is how this constant came to exist.
 */
export const COARSE_RATIO_RUNS = 10;

/** One timed call, on a monotonic clock. */
export type Measure<T> = (input: T) => number;

/**
 * The fastest run of each of two inputs, measured **interleaved**.
 *
 * Interleaved because measuring them in two consecutive blocks lets a burst of contention land
 * entirely inside one of them and corrupt the comparison; alternating means a stall has to hit every
 * run of the same input to survive the minimum, and any uniform slowdown scales both and cancels out
 * of the ratio.
 */
export function fastestInterleaved<T>(
  measure: Measure<T>,
  first: T,
  second: T,
  runs: number = RATIO_RUNS
): [number, number] {
  let bestFirst = Number.POSITIVE_INFINITY;
  let bestSecond = Number.POSITIVE_INFINITY;
  for (let run = 0; run < runs; run++) {
    bestFirst = Math.min(bestFirst, measure(first));
    bestSecond = Math.min(bestSecond, measure(second));
  }
  return [bestFirst, bestSecond];
}

/**
 * The fastest run of **every** input, measured round-robin.
 *
 * The N-way version of `fastestInterleaved`, for a comparison that needs more than two numbers — the
 * tag-matching gate subtracts one growth exponent from another, which needs four measurements and is
 * therefore about twice as noisy as a single exponent.
 *
 * Measuring the two exponents one after the other, each internally interleaved, is not enough: the
 * two live in different time windows, so a burst of contention inside one of them survives into the
 * difference. Measured that way the excess swung from −0.26 to +0.31 across three runs of the full
 * parallel suite — a range of 0.57 against a bar of 0.5, which is a flake that had not happened yet.
 * Round-robin puts all four measurements in the same window, where contention correlates and largely
 * cancels out of the difference.
 */
export function fastestRoundRobin<T>(measure: Measure<T>, inputs: readonly T[], runs: number = RATIO_RUNS): number[] {
  const best = inputs.map(() => Number.POSITIVE_INFINITY);
  for (let run = 0; run < runs; run++) {
    for (let i = 0; i < inputs.length; i++) {
      best[i] = Math.min(best[i]!, measure(inputs[i]!));
    }
  }
  return best;
}

/**
 * An exponent from two already-measured timings.
 *
 * Split across two statements rather than nested on one line: `Math.log(a / b) / Math.log(c)` puts
 * two slashes on one line, and `pattern-shape.test.ts` — which audits every regular expression in the
 * package — reads what sits between them as a regex literal. The test files doing the same arithmetic
 * are skipped by that audit; this file is not, because it is not a test file.
 */
export function exponentFrom(smallMs: number, largeMs: number, factor: number): number {
  const ratio = largeMs / Math.max(smallMs, 0.5);
  return Math.log(ratio) / Math.log(factor);
}

/**
 * How the cost grows when the input grows by `factor`, as an exponent: 1.0 is linear, 2.0 quadratic.
 *
 * An exponent rather than a raw ratio because it reads the same on any machine and does not silently
 * change meaning if the factor ever does. The floor on the small measurement keeps a sub-millisecond
 * reading from dividing into nonsense; it can only *lower* the exponent, which is the lenient
 * direction and so can never manufacture a failure.
 */
export function growthExponent<T>(
  measure: Measure<T>,
  small: T,
  large: T,
  factor: number,
  runs: number = RATIO_RUNS
): number {
  const [smallMs, largeMs] = fastestInterleaved(measure, small, large, runs);
  return exponentFrom(smallMs, largeMs, factor);
}
