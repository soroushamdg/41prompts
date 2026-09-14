import { relative } from "node:path";
import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
  TestCase,
  TestResult
} from "@playwright/test/reporter";

import { skipReport, type SkippedTest } from "./skips";

/**
 * Prints what the run **did not** run, and fails the run when a skip has no platform to explain it.
 *
 * The decision is `skips.ts`, tested without a browser. This is the thin half: turn Playwright's
 * objects into that function's input, print its lines, and hand its verdict back to the runner
 * through `onEnd`'s return value.
 *
 * Registered **alongside** the default reporter in `playwright.config.ts` rather than replacing it,
 * so the ordinary output is unchanged and this is a paragraph at the end of it.
 */
export default class SkipReporter implements Reporter {
  private readonly skipped: SkippedTest[] = [];
  private total = 0;
  private root = process.cwd();

  onBegin(config: FullConfig, suite: Suite): void {
    this.root = config.rootDir;
    this.total = suite.allTests().length;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    // `result.status`, not `test.expectedStatus`: a spec's `test.skip(condition)` only skips when
    // the condition holds, and that is decided at run time.
    if (result.status !== "skipped") return;
    this.skipped.push({
      title: test.title,
      file: relative(this.root, test.location.file),
      reason: test.annotations.find((note) => note.type === "skip")?.description ?? "",
      // Both specs that own `-linux.png` files put them under a `visual regression` describe, so
      // matching the title path rather than the filename covers a third spec for free.
      visual: test.titlePath().some((part) => part.toLowerCase().includes("visual regression"))
    });
  }

  // `async` is not decoration: `Reporter.onEnd` is typed `Promise<…> | void`, so a bare object
  // return does not satisfy it. Returning the verdict synchronously fails `next build`'s type check.
  async onEnd(result: FullResult): Promise<{ status?: FullResult["status"] } | void> {
    const report = skipReport({
      skipped: this.skipped,
      total: this.total,
      platform: process.platform,
      updateVisual: process.env.UPDATE_VISUAL !== undefined
    });

    if (report.lines.length === 0) return;

    console.log("");
    for (const line of report.lines) console.log(`  ${line}`);
    console.log("");

    // Only ever makes a run worse. A run that already failed keeps the status it earned.
    if (report.fail && result.status === "passed") return { status: "failed" };
  }
}
