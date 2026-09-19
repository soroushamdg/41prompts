// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary

/**
 * **A test about `41p` that lives in `apps/web`, deliberately.** Read this before moving it back.
 *
 * `pnpm mirror-dry-run` filters the repository down to the four public packages and runs their
 * suites there — it is the gate that proves the public tree stands on its own. `scripts/` is
 * excluded from that tree on purpose, and `node_modules/.pnpm` and the monorepo's own layout are
 * not part of it either.
 *
 * So a test inside `packages/cli` that reaches for any of those **fails in the mirror and nowhere
 * else**, which is `docs/PROCESS.md`'s "Local green is not CI green" failure #1, verbatim:
 * `packages/core`'s suite once read `apps/worker/src/runs/execute.ts`, was green in the monorepo,
 * and died on `ENOENT` in the one job that filtered the tree. This file was written inside
 * `packages/cli` first and reproduced it within the hour.
 *
 * The alternative was a skip, and `docs/PROCESS.md` is unambiguous that a skip reads as a pass in a
 * summary line. Moving it to a package the mirror does not contain means it always runs, exactly
 * once, with no condition attached.
 *
 * `apps/web/forbidden-words.test.ts` is the precedent: it tests `scripts/forbidden-words.mjs` and
 * lives here for the same reason.
 */

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

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

/**
 * `process.env`, minus the two variables `@41prompts/cli` reads.
 *
 * Typed as `typeof process.env` rather than `NodeJS.ProcessEnv`: the `NodeJS` namespace is a global
 * this package's eslint config does not know about, and `no-undef` is right that it is not defined
 * anywhere it can see. The structural type is the same and needs no ambient name.
 */
function environmentWithoutKeys(): typeof process.env {
  const copy = { ...process.env };
  delete copy.FORTYONE_API_KEY;
  delete copy.FORTYONE_BASE_URL;
  return copy;
}

/** Run the packed binary. Returns its streams and exit code; never throws on a non-zero exit. */
function run(args: readonly string[], cwd = work): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [bin, ...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      // The environment minus the two names the CLI reads. A developer's own key, or a `.env` that
      // happens to be exported, must not change what this proves — `41p link` with a key in the
      // environment does something completely different from `41p link` without one.
      //
      // Subtractive rather than a hand-built `{ PATH, HOME }`: that version needed `NODE_ENV` to
      // satisfy `apps/web`'s augmented `ProcessEnv` and would have kept needing whatever Node wants
      // next. Removing exactly what must not leak says what is meant.
      env: environmentWithoutKeys(),
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
