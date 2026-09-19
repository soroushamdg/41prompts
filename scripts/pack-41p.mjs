// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary

/**
 * Assemble `41p` the way npm would install it, and print the path to its entry point (EPIC-053).
 *
 * ## Why this is needed at all
 *
 * `packages/cli/dist/bin.js` cannot be run from inside this repository. It imports
 * `@41prompts/core`, and in the monorepo that package's `main` points at `src/index.ts` — source,
 * not `dist`, which is deliberate and is what lets every other package import core without a build
 * step. Node then meets a `.ts` file and refuses it.
 *
 * On npm the same `dist/bin.js` is fine: `publishConfig` swaps every entry point to `dist`, and the
 * dependency resolves to a published package that has one.
 *
 * So the difference is the *layout*, not the code — and the way to run the real binary locally is to
 * build the layout rather than to run the source.
 *
 * ## Which is the whole point: the drive must not run `tsx src/bin.ts`
 *
 * That would be `docs/PROCESS.md`'s twenty-epic failure in a different costume — a development
 * convenience that resembles the artifact, standing in for the artifact, and unable to fail the way
 * the artifact fails. A packed tree can fail the way a published package fails: a missing file in
 * `files`, an entry point that is not there, an import that only resolved because the monorepo
 * hoisted it.
 *
 * ## What it does
 *
 * Builds `core`, `sdk-ts` and `cli`, then copies each one's `dist` and a `publishConfig`-applied
 * manifest into `node_modules/@41prompts/…` under a temp directory, and prints the path to
 * `node_modules/@41prompts/cli/dist/bin.js`.
 *
 * `--out <dir>` puts it somewhere durable, which is what the drive uses so its transcript names a
 * path that still exists afterwards.
 *
 * `--no-build` packs whatever `dist` is already there. **`packed.test.ts` must pass it**, and the
 * reason is a failure this caused: a test that shells out to `pnpm build` while turbo is already
 * running the test task rebuilds `dist` underneath the packages running beside it. It took out
 * `@41prompts/sdk`'s own tarball test — which had just listed a `dist` that was being rewritten —
 * and `@41prompts/web`'s suite, in two different runs, with two different-looking failures and one
 * cause. `packages/cli/turbo.json` orders the builds instead, which is turbo's job and not a test's.
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Every workspace package the CLI needs at run time, in dependency order. */
const PACKAGES = [
  { name: "@41prompts/core", dir: "packages/core" },
  { name: "@41prompts/sdk", dir: "packages/sdk-ts" },
  { name: "@41prompts/cli", dir: "packages/cli" },
];

const argv = process.argv.slice(2);
const outFlag = argv.indexOf("--out");
const quiet = argv.includes("--quiet");
const noBuild = argv.includes("--no-build");
const say = (line) => {
  if (!quiet) process.stderr.write(`${line}\n`);
};

const out = outFlag === -1 ? mkdtempSync(join(tmpdir(), "41p-packed-")) : resolve(argv[outFlag + 1]);
if (outFlag !== -1) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
}

say(`packing into ${out}`);
if (noBuild) {
  for (const pkg of PACKAGES) {
    if (!existsSync(join(REPO, pkg.dir, "dist"))) {
      process.stderr.write(`pack-41p: ${pkg.name} has no dist and --no-build was passed. Run \`pnpm build\` first.\n`);
      process.exit(2);
    }
  }
} else {
  for (const pkg of PACKAGES) {
    say(`  building ${pkg.name}`);
    execFileSync("pnpm", ["--filter", pkg.name, "build"], { cwd: REPO, stdio: quiet ? "pipe" : "inherit" });
  }
}

for (const pkg of PACKAGES) {
  const from = join(REPO, pkg.dir);
  const to = join(out, "node_modules", pkg.name);
  mkdirSync(to, { recursive: true });
  cpSync(join(from, "dist"), join(to, "dist"), { recursive: true });

  // `publishConfig` is exactly what npm merges on publish. Applying it is what makes this the
  // package a customer installs rather than the workspace one.
  const manifest = JSON.parse(readFileSync(join(from, "package.json"), "utf8"));
  const published = { ...manifest, ...(manifest.publishConfig ?? {}) };
  delete published.publishConfig;
  delete published.devDependencies;
  delete published.scripts;
  // The workspace protocol is not a version npm understands, and nothing here installs from a
  // registry — the packages are siblings in one `node_modules`, which is what pnpm's own hoisting
  // would produce for a dependency tree this shallow.
  for (const [dependency, range] of Object.entries(published.dependencies ?? {})) {
    if (range.startsWith("workspace:")) published.dependencies[dependency] = manifest.version;
  }
  writeFileSync(join(to, "package.json"), `${JSON.stringify(published, null, 2)}\n`);
  say(`  installed ${pkg.name}`);
}

writeFileSync(join(out, "package.json"), `${JSON.stringify({ name: "packed-41p", private: true, type: "module" }, null, 2)}\n`);

const bin = join(out, "node_modules", "@41prompts", "cli", "dist", "bin.js");
say("packed.");
process.stdout.write(`${bin}\n`);
