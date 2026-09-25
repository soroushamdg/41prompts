#!/usr/bin/env node
// EPIC-072: the data behind `/legal/third-party-notices`, generated rather than typed.
//
// `docs/roadmap.md` names a third-party notices page in two places — EPIC-071's Tasks line says
// "generated from the SBOM" and EPIC-072's names the route. This is the generator.
//
// **It reads the same source `scripts/license-gate.mjs --sbom` reads**: `pnpm licenses list`, which
// reports the SPDX identifier each package declares in its own manifest. Two commands reading one
// source cannot disagree; two hand-maintained lists always eventually do.
//
// **`--prod`, and that is the one place this differs from the SBOM.** The SBOM describes the
// workspace, so it carries vitest, Playwright and the rest of the toolchain. A notices page is about
// what is *distributed* — what runs in the deployed application and what a reader installs — and
// listing a test runner there is not more honest, it is less: it makes the list longer without
// making it more complete, and the reader cannot tell which entries are about software they have.
// 564 packages become 423.
//
// The output is committed, because a page cannot run pnpm at request time and a build step that
// shells out to the package manager is a build that breaks in an image with no store. It is kept
// honest by `apps/web/lib/site/third-party-notices.test.ts`, which re-runs this and fails if the
// committed file is stale — measured at about a second, so it is a test rather than a ritual.
//
// Usage: node scripts/third-party-notices.mjs [--check]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const NOTICES_FILE = join(REPO_ROOT, "apps", "web", "lib", "site", "third-party-notices.generated.json");

/**
 * Everything the workspace resolves, as `{ name, version, license }`, sorted.
 *
 * `pnpm licenses list --json` groups by licence at the top level and lists each package underneath; a
 * package resolved at two versions appears once with both. Flattened here so the page can group it
 * its own way.
 */
export function collect() {
  const raw = execFileSync("pnpm", ["licenses", "list", "--prod", "--json"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(raw);

  const rows = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const entry of packages) {
      for (const version of entry.versions ?? []) {
        if (declaresPlatform(entry.paths)) continue;
        rows.push({
          name: entry.name,
          version,
          license,
          homepage: typeof entry.homepage === "string" && entry.homepage.length > 0 ? entry.homepage : null,
        });
      }
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
  return rows;
}

/**
 * Packages that declare their own platform, which are **excluded**.
 *
 * ## The check was machine-dependent, which means it was not a gate
 *
 * `pnpm licenses list` reports what is **installed**, and a platform-specific package installs only
 * where it belongs. So this file, generated on a Mac, carried `@esbuild/darwin-x64` and eight like
 * it; the Linux runner regenerated it with the `linux-x64` names and reported the committed file
 * **stale**. `main` was red on GitHub from 2026-09-20 for that reason alone, while `--check` said
 * *"current"* on every developer's machine. A check whose answer depends on who runs it cannot be a
 * gate.
 *
 * ## The signal is the package's own manifest, not its name
 *
 * **The first fix matched names** — anything carrying `darwin`, `linux`, `x64` and so on — and it
 * was wrong in a way that took a red CI run to show: **`fsevents` is macOS-only and its name says
 * nothing about that.** A name pattern can only exclude what the machine running it happens to
 * install, which is precisely the property being fixed.
 *
 * `os` and `cpu` in a package's own `package.json` are npm's declaration of exactly this, they are
 * what the package manager itself uses to decide whether to install it, and they are **symmetric**:
 * the same rule removes the darwin builds here and the linux builds on the runner.
 *
 * ## What it costs the reader, measured rather than assumed
 *
 * Seven of the nine are one platform's build of a project **already in the list** — `esbuild`,
 * `sharp`, `next`, `rollup`, `lightningcss`, `@tailwindcss/oxide`, `@sentry/cli` — with the same
 * licence and literally the same `homepage`. Nothing is lost by dropping them.
 *
 * **`fsevents` is the one that is a project in its own right**, and dropping it is still right:
 * it is macOS-only, the deployed application runs on Linux, and a notices page is about what is
 * **distributed**. Listing a package no user ever receives is not more honest, it is less.
 */
function declaresPlatform(paths) {
  for (const dir of paths ?? []) {
    try {
      const manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
      if (Array.isArray(manifest.os) || Array.isArray(manifest.cpu)) return true;
    } catch {
      // A package whose manifest cannot be read is kept: the notices page erring towards listing
      // something is the right direction for it to err in.
    }
  }
  return false;
}

export function render(rows) {
  return `${JSON.stringify({ generatedFrom: "pnpm licenses list --prod --json, minus per-platform native builds", packages: rows }, null, 2)}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const next = render(collect());
  if (process.argv.includes("--check")) {
    const current = readFileSync(NOTICES_FILE, "utf8");
    if (current !== next) {
      console.error("third-party notices are stale. Run: node scripts/third-party-notices.mjs");
      process.exit(1);
    }
    console.log("third-party notices are current.");
  } else {
    writeFileSync(NOTICES_FILE, next);
    console.log(`Wrote ${JSON.parse(next).packages.length} packages to ${NOTICES_FILE}`);
  }
}
