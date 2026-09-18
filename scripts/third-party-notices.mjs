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

export function render(rows) {
  return `${JSON.stringify({ generatedFrom: "pnpm licenses list --prod --json", packages: rows }, null, 2)}\n`;
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
