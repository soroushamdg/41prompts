// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

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
 * `docs/roadmap.md`'s Review line for this epic, executed (EPIC-053, C4 and C5).
 *
 * > **Review.** Generated code compiles under strict in a fresh project.
 *
 * ## It builds a fresh project rather than asserting about one
 *
 * A unit test that checked the generated file's *text* would be checking the generator against
 * itself. The claim is about a toolchain a customer runs, so the toolchain is run: a temp directory
 * with `@41prompts/sdk`'s **published** declarations in `node_modules`, `strict: true`,
 * `skipLibCheck: false`, and `tsc`. Python gets the same treatment with `mypy --strict`.
 *
 * `skipLibCheck: false` is deliberate. With it on, a broken declaration inside the SDK would go
 * unnoticed and this test would only be checking the six lines of the generated file.
 *
 * ## Each half carries a negative control
 *
 * A checker that silently did nothing would pass every assertion here. So each half also runs a file
 * with a deliberate type error and requires it to **fail** — the shape lesson 8 asks for, and the
 * reason is that a green here is the whole evidence for the roadmap's Review line.
 *
 * ## Nothing is skipped
 *
 * If the SDK's `dist` is absent this builds it; if `uv` is missing the Python half **fails** rather
 * than skipping. `docs/PROCESS.md`: a skip reads as a pass in a summary line, and that has cost this
 * project a CI failure already.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SDK = join(REPO, "packages", "sdk-ts");
const GOLDENS = join(REPO, "packages", "cli", "src", "__goldens__");

const scratches: string[] = [];
const scratch = (label: string): string => {
  const dir = mkdtempSync(join(tmpdir(), `41p-${label}-`));
  scratches.push(dir);
  return dir;
};
afterAll(() => {
  for (const dir of scratches) rmSync(dir, { recursive: true, force: true });
});

/** Runs a command and returns its combined output, or `null` when it succeeded. */
function failureOf(command: string, args: readonly string[], cwd: string): string | null {
  try {
    execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });
    return null;
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    return `${err.stdout ?? ""}${err.stderr ?? ""}${err.stdout === undefined && err.stderr === undefined ? (err.message ?? "") : ""}`;
  }
}

function findInStore(name: string): string {
  const base = join(REPO, "node_modules", ".pnpm");
  const found = execFileSync(
    "find",
    [base, "-maxdepth", "4", "-type", "d", "-path", `*/node_modules/${name}`],
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((line) => line.length > 0);
  if (found[0] === undefined) throw new Error(`${name} is not in the pnpm store; run pnpm install`);
  return found[0];
}

/** A temp project with the SDK installed the way npm would install it. */
function freshTypescriptProject(file: string): string {
  if (!existsSync(join(SDK, "dist", "index.d.ts"))) {
    // Build rather than skip. `pnpm test` does not depend on `^build`, and a skipped criterion is
    // exactly the thing this file exists to avoid.
    execFileSync("node", ["build.mjs"], { cwd: SDK, stdio: "pipe" });
  }

  const dir = scratch("compiles");
  const installed = join(dir, "node_modules", "@41prompts", "sdk");
  mkdirSync(installed, { recursive: true });
  cpSync(join(SDK, "dist"), join(installed, "dist"), { recursive: true });

  // `publishConfig` is what npm applies on publish, so applying it here is what makes this the
  // package a customer receives rather than the workspace one.
  const manifest = JSON.parse(readFileSync(join(SDK, "package.json"), "utf8")) as Record<string, unknown>;
  const publishConfig = manifest.publishConfig as Record<string, unknown>;
  writeFileSync(
    join(installed, "package.json"),
    JSON.stringify({ ...manifest, ...publishConfig, publishConfig: undefined, scripts: undefined, devDependencies: undefined }),
  );

  cpSync(findInStore("@types/node"), join(dir, "node_modules", "@types", "node"), { recursive: true });
  cpSync(findInStore("undici-types"), join(dir, "node_modules", "undici-types"), { recursive: true });

  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fresh", private: true, type: "module" }));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        types: ["node"],
        noEmit: true,
        skipLibCheck: false,
      },
      include: ["prompts.ts"],
    }),
  );
  writeFileSync(join(dir, "prompts.ts"), file);
  return dir;
}

const tsc = (dir: string): string | null =>
  failureOf("node", [join(REPO, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], dir);

describe("the generated TypeScript compiles under strict in a fresh project", () => {
  it("compiles the golden with no errors", () => {
    const dir = freshTypescriptProject(readFileSync(join(GOLDENS, "prompts.ts.txt"), "utf8"));
    expect(tsc(dir)).toBeNull();
  }, 120_000);

  it("— and the same check fails on a file with a type error", () => {
    // The negative control. A `tsc` that was not actually running would pass the test above.
    const broken = `${readFileSync(join(GOLDENS, "prompts.ts.txt"), "utf8")}\nconst n: number = dailySummary();\n`;
    const failure = tsc(freshTypescriptProject(broken));
    expect(failure).not.toBeNull();
    expect(failure).toContain("prompts.ts");
  }, 120_000);

  it("the golden's awkward names really are the hard cases", () => {
    // If the golden ever stopped containing these, the test above would still pass and would be
    // proving much less than it claims. This is what keeps it honest.
    const golden = readFileSync(join(GOLDENS, "prompts.ts.txt"), "utf8");
    expect(golden).toContain('"customer name": string');
    expect(golden).toContain('"x-locale"?: string');
    expect(golden).toContain("export function p2024Refunds");
    expect(golden).toContain("export function refundClassifier2");
  });
});

describe("the generated Python passes mypy --strict", () => {
  const pythonProject = (file: string): string => {
    const dir = scratch("mypy");
    cpSync(join(REPO, "sdks", "python", "fortyone"), join(dir, "fortyone"), { recursive: true });
    writeFileSync(join(dir, "prompts.py"), file);
    return dir;
  };

  const mypy = (dir: string): string | null =>
    failureOf("uv", ["run", "--with", "mypy", "--python", "3.12", "mypy", "--strict", "prompts.py", "fortyone/__init__.py"], dir);

  it("checks the golden with no errors", () => {
    // `uv` missing is a failure, not a skip: `gates.mjs` already refuses to start without it, and a
    // skipped criterion reads as a ticked one in a summary line.
    const dir = pythonProject(readFileSync(join(GOLDENS, "prompts.py.txt"), "utf8"));
    expect(mypy(dir)).toBeNull();
  }, 180_000);

  it("— and the same check fails on a file with a type error", () => {
    const broken = `${readFileSync(join(GOLDENS, "prompts.py.txt"), "utf8")}\nn: int = daily_summary()\n`;
    const failure = mypy(pythonProject(broken));
    expect(failure).not.toBeNull();
    expect(failure).toContain("prompts.py");
  }, 180_000);
});
