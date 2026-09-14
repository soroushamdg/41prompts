/**
 * **What the run did not run, said out loud.**
 *
 * `docs/PROCESS.md`, "Local green is not CI green", failure 4: the four visual-regression baselines
 * are committed as `-linux.png` and their specs carry a platform guard, so on macOS they skip. The
 * suite then ends `178 passed, 4 skipped` and exits 0 — and CI #206 was a layout change that
 * survived every local run for exactly that reason. The gate that would have caught it never
 * executed, and one word in a summary line was the only trace.
 *
 * `gates.mjs ci` already prints a caveat about this, but only that mode does, and only as a count.
 * This is the narrower thing the caveat stands in for: the suite names what it skipped, by name, at
 * the point of running it, whichever command invoked it.
 *
 * Two verdicts, because a skip means opposite things on the two platforms:
 *
 * - **On a platform the baselines are not for**, a skip is expected and is still not coverage. It is
 *   reported by name and the run stays green. Failing here would make `pnpm e2e` permanently red on
 *   the machine it is mostly run from, and a gate that is always red is a gate that gets ignored.
 * - **On `linux`**, a skip is a defect. Linux is the platform these exist for, so the only way to
 *   reach one is a missing `-linux.png`: `landing.spec.ts` guards on `existsSync(baseline)` and
 *   would otherwise skip itself silently in CI over a baseline nobody committed. That is the same
 *   silent pass with no platform to explain it, so it fails the run.
 *
 * Kept as a pure function because the interesting case is **linux** and this is mostly run from a
 * Mac. A guard that could only be tested on the platform it guards is a guard nobody tests.
 */

/** One test the run skipped, as much of it as the verdict needs. */
export interface SkippedTest {
  /** The test's own title. */
  title: string;
  /** The spec it came from, repo-relative. */
  file: string;
  /** The description Playwright carries from `test.skip(condition, description)`, where given. */
  reason: string;
  /** Whether it sits under a `visual regression` describe — the suite that owns the `-linux.png` files. */
  visual: boolean;
}

export interface SkipReport {
  /** True when the run must be failed even though everything that ran passed. */
  fail: boolean;
  /** The lines to print, in order. Empty when nothing skipped. */
  lines: string[];
}

export interface SkipReportInput {
  skipped: SkippedTest[];
  /** Every test the run collected, so the report reads "4 of 182" rather than "4". */
  total: number;
  /** `process.platform` for the run. */
  platform: string;
  /** `UPDATE_VISUAL` — the regeneration run, which is meant to skip and is driven by hand. */
  updateVisual: boolean;
}

export function skipReport({ skipped, total, platform, updateVisual }: SkipReportInput): SkipReport {
  if (skipped.length === 0) return { fail: false, lines: [] };

  const lines = [`${skipped.length} of ${total} tests did not run on ${platform}. A skip is not a pass.`];
  for (const test of skipped) {
    lines.push(`  · ${test.title}  (${test.file})${test.reason === "" ? "" : ` — ${test.reason}`}`);
  }

  // The regeneration run skips on purpose, is started by hand, and is not evidence of anything. It
  // still gets the list above; it just does not get the verdict.
  const visualSkips = updateVisual ? [] : skipped.filter((test) => test.visual);
  if (visualSkips.length === 0) return { fail: false, lines };

  if (platform === "linux") {
    lines.push(
      "",
      `FAILED: ${visualSkips.length} visual-regression test(s) skipped on linux — the platform their`,
      "baselines are for. A skip here is a missing `-linux.png`, not a platform difference, and it",
      "would otherwise read as a pass in CI. Commit the baseline, or regenerate it with the Docker",
      'procedure in docs/PROCESS.md, "Visual-regression baselines, and Docker disk".'
    );
    return { fail: true, lines };
  }

  lines.push(
    "",
    `The ${visualSkips.length} visual-regression tests above are the layout gate, and they did not run here.`,
    "Their baselines are `-linux.png`; CI is Linux and is where they mean something. A layout change",
    "can pass everything on this machine and fail there — that is CI #206, 2026-09-14.",
    'To run them: docs/PROCESS.md, "Visual-regression baselines, and Docker disk".'
  );
  return { fail: false, lines };
}
