// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * The binary, as npm would install it (EPIC-053).
 *
 * ## Every other test in this package runs functions. This one runs the program
 *
 * `runCommand(env, argv)` is the right seam for asserting behaviour, and it cannot fail the way a
 * published package fails: an entry point missing from `files`, a `bin` that points at a path the
 * tarball does not contain, an import that only ever resolved because the monorepo hoisted it, a
 * `publishConfig` that swaps `main` and forgets `exports`.
 *
 * `scripts/pack-41p.mjs` builds the layout npm would produce and this runs the result. It is the
 * same argument as `docs/PROCESS.md`'s "only the built app can fail the way the built app fails",
 * applied to a package instead of a page — and it is why the drive runs the packed binary rather
 * than `tsx src/bin.ts`.
 *
 * It costs a build of three packages. That is the most expensive test here by a distance, and it is
 * one test rather than a suite for that reason: what it proves is that the thing assembles and runs
 * at all, not what it does once it has.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let bin = "";
let work = "";

beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), "41p-packed-"));
  // `--no-build`: `packages/cli/turbo.json` makes this package's `test` task depend on `build`, so
  // core, the SDK and the CLI are all built before a test runs. Building here instead would rebuild
  // `dist` underneath the packages testing alongside this one — which is exactly what it did once.
  bin = execFileSync("node", [join(REPO, "scripts", "pack-41p.mjs"), "--quiet", "--no-build", "--out", join(work, "packed")], {
    cwd: REPO,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}, 120_000);

afterAll(() => {
  rmSync(work, { recursive: true, force: true });
});

/** Run the packed binary. Returns its streams and exit code; never throws on a non-zero exit. */
function run(args: readonly string[], cwd = work): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [bin, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // No inherited FORTYONE_* — a developer's own key must not change what this test proves.
      env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
    });
    return { code: 0, stdout, stderr: "" };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? -1, stdout: failure.stdout ?? "", stderr: failure.stderr ?? "" };
  }
}

describe("the packed binary", () => {
  it("runs, and prints its version", () => {
    expect(run(["--version"]).stdout.trim()).toBe("0.1.0");
  });

  it("prints help and exits 0", () => {
    const result = run(["--help"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("41p decompile <file>");
  });

  it("exits 2 on an unknown command, with no stack trace", () => {
    const result = run(["nonsense"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('41p has no command "nonsense"');
    expect(result.stderr).not.toContain("at Object.");
    expect(result.stderr).not.toContain("node:internal");
  });

  it("decompiles a file offline, with no key and no network", () => {
    const file = join(work, "prompt.txt");
    writeFileSync(
      file,
      [
        "You are a support assistant. Always respond in JSON only.",
        "Never mention that you are an AI model.",
        "You must respond in JSON only.",
      ].join("\n\n"),
    );
    const result = run(["decompile", "prompt.txt"]);

    // Exit 1 because there are findings — the repeated rule, at minimum. `decompile` is the one
    // command that needs nothing configured, which is what makes it the one worth running here.
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("bloks");
    expect(result.stdout).toContain("Findings:");
  });

  it("exits 2 rather than hanging when it has no key and no terminal", () => {
    // `docs/roadmap.md`'s "fail in CI". `execFileSync` with stdin ignored is exactly a CI shell, so
    // a version of `link` that asked a question would hang here until the test timed out.
    const result = run(["link"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("FORTYONE_API_KEY");
  }, 30_000);

  it("ships the files it says it ships", () => {
    // `bin` pointed at `src/bin.ts` while `files` shipped only `dist` until this epic, which would
    // have published a package with no entry point. This is the assertion that would have caught it.
    expect(bin.endsWith(join("@41prompts", "cli", "dist", "bin.js"))).toBe(true);
  });
});
