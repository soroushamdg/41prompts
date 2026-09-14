import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { skipReport, type SkippedTest } from "./e2e/skips";

/**
 * **A skipped test is not a passing test**, and the summary line cannot tell them apart.
 *
 * `docs/PROCESS.md`, "Local green is not CI green", failure 4 — the one the CI-parity mode named and
 * left open. The four visual-regression tests skip on macOS, the suite exits 0, and CI #206 was a
 * layout change that survived every local run because of it.
 *
 * The verdict is exercised here rather than through a Playwright run because the case that matters
 * is **linux**, and this is mostly run from a Mac. A guard that could only be tested on the platform
 * it guards is a guard nobody tests — which is the shape of the original defect, one level up.
 */

const visualSkip = (title: string): SkippedTest => ({
  title,
  file: "apps/web/e2e/landing.spec.ts",
  reason: "visual baselines are Linux-only — see EPIC-016's report",
  visual: true
});

const ordinarySkip: SkippedTest = {
  title: "something conditional",
  file: "apps/web/e2e/auth.spec.ts",
  reason: "needs a provider key",
  visual: false
};

describe("what the e2e run did not run", () => {
  it("says nothing when nothing skipped", () => {
    expect(skipReport({ skipped: [], total: 182, platform: "darwin", updateVisual: false })).toEqual({
      fail: false,
      lines: []
    });
  });

  it("names every skipped test, so a count is never the whole report", () => {
    const report = skipReport({
      skipped: [visualSkip("landing page, light theme"), visualSkip("landing page, dark theme")],
      total: 182,
      platform: "darwin",
      updateVisual: false
    });
    expect(report.lines[0]).toBe("2 of 182 tests did not run on darwin. A skip is not a pass.");
    const printed = report.lines.join("\n");
    expect(printed).toContain("landing page, light theme");
    expect(printed).toContain("landing page, dark theme");
    expect(printed).toContain("apps/web/e2e/landing.spec.ts");
    expect(printed).toContain("visual baselines are Linux-only");
  });

  it("stays green on darwin, because a permanently red gate is an ignored gate", () => {
    const report = skipReport({
      skipped: [visualSkip("landing page, light theme")],
      total: 182,
      platform: "darwin",
      updateVisual: false
    });
    expect(report.fail).toBe(false);
    expect(report.lines.join("\n")).toContain("CI #206");
  });

  it("fails on linux, where a skip is a missing baseline rather than a platform", () => {
    const report = skipReport({
      skipped: [visualSkip("landing page, light theme")],
      total: 182,
      platform: "linux",
      updateVisual: false
    });
    expect(report.fail).toBe(true);
    expect(report.lines.join("\n")).toContain("missing `-linux.png`");
  });

  it("does not fail the regeneration run, which is meant to skip", () => {
    const report = skipReport({
      skipped: [visualSkip("landing page, light theme")],
      total: 182,
      platform: "linux",
      updateVisual: true
    });
    expect(report.fail).toBe(false);
    // Still listed: UPDATE_VISUAL=1 is not a reason to stop saying what did not run.
    expect(report.lines[0]).toContain("did not run");
  });

  it("reports a skip that is not the visual gate without failing anywhere", () => {
    for (const platform of ["linux", "darwin"]) {
      const report = skipReport({ skipped: [ordinarySkip], total: 182, platform, updateVisual: false });
      expect(report.fail, platform).toBe(false);
      expect(report.lines.join("\n"), platform).toContain("something conditional");
    }
  });
});

/**
 * The verdict above keys on a `visual regression` describe title. That is a string agreement between
 * two files and a reporter, so it is asserted rather than assumed: rename the describe and this
 * fails here, instead of the gate quietly becoming a no-op that still prints a reassuring list.
 */
describe("the marker the reporter matches on", () => {
  const e2eDir = join(dirname(fileURLToPath(import.meta.url)), "e2e");
  const snapshotOwners = readdirSync(e2eDir).filter((entry) => entry.endsWith(".spec.ts-snapshots"));

  it("is on every spec that owns -linux.png baselines", () => {
    expect(snapshotOwners.length).toBeGreaterThan(0);
    for (const owner of snapshotOwners) {
      const spec = join(e2eDir, owner.replace("-snapshots", ""));
      expect(readFileSync(spec, "utf-8"), `${spec} must keep the describe the reporter matches`).toContain(
        'test.describe("visual regression"'
      );
    }
  });
});
