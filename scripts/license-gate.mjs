#!/usr/bin/env node
// EPIC-007 decision 4: a licence outside the allow-list fails the build for a public package's
// own dependency closure (the four npm distributions named in PUBLIC_PACKAGES below — the two
// PyPI distributions are a separate, non-pnpm ecosystem and ship zero dependencies per their
// pyproject.toml, so they are not checked here); the same finding anywhere else in the workspace
// is a warning, not a failure.
// Also emits the CycloneDX SBOM `pnpm sbom` uses (see .github/workflows/compliance.yml).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";

// The pure half of the proprietary boundary, in its own module so it can be tested without
// running this gate. See that file's header for why the SPDX tags in it are built from fragments.
import {
  HEADER_EXEMPT,
  PROPRIETARY_SPDX,
  apacheDeclarations,
  boundaryFiles,
  proprietaryGlobs,
} from "./license-boundary.mjs";

// Every npm distribution that is actually published — `publishConfig.access: "public"` in its
// own manifest. These are pnpm FILTER names, so they must be package names and not directory
// names: from EPIC-007 until EPIC-056 this list said "@41prompts/sdk-ts", which is the directory
// `packages/sdk-ts` and not the package `@41prompts/sdk`, so it matched no project and pnpm
// quietly narrowed the check to the two names that did match. The SDK's dependency closure —
// the one package whose code is inlined into somebody else's application — had never been
// licence-checked, and `41p` was not here at all.
//
// `apps/web/public-distributions.test.ts` asserts this list equals what the workspace publishes.
const PUBLIC_PACKAGES = ["@41prompts/core", "@41prompts/cli", "@41prompts/sdk", "41p"];

// Permissive-only (decision 4's exact list). Pnpm reports the SPDX identifier as declared in
// each package's own package.json `license` field, which is why both hyphen styles for BSD show
// up in practice.
//
// EPIC-901, 2026-09-18: `MIT-0`, `BlueOak-1.0.0` and `CC0-1.0` were added after the first monthly
// audit. All three are unambiguously permissive — MIT-0 is MIT with the attribution clause removed,
// BlueOak-1.0.0 is OSI-approved and was written to be clearer than MIT, and CC0-1.0 is a
// public-domain dedication — and all three were producing warnings on every compliance run for nine
// of the seventeen findings EPIC-007's report asked someone to actually look at. A permanent warning
// about a licence nobody objects to is noise that teaches people to skim the list, which is how the
// tenth one gets missed. Added here rather than baselined in `docs/security/audit-baseline.json`,
// because a baseline entry is for something accepted **despite** being a concern and these are not.
const ALLOWED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "0BSD",
  "Unlicense",
  "Python-2.0",
  "MIT-0",
  "BlueOak-1.0.0",
  "CC0-1.0",
]);

// --- The proprietary boundary (2026-09-13) -----------------------------------------------------
//
// The repository is public for a limited period, which makes the licence split the only thing
// separating "you may use this" from "you may not". Nothing enforced that split before: the four
// proprietary packages were proprietary by convention, and a convention erodes quietly — a copied
// file header, a package scaffolded from a public sibling, a REUSE glob edited without noticing
// what it covered. None of those would have failed a build.
//
// Two failures, both hard, because both are the boundary moving rather than a style slip:
//   1. a proprietary package losing its marker (LICENSE file, package.json licence, REUSE cover);
//   2. an Apache-2.0 SPDX header appearing on a file inside one, which is a grant by accident.
// REUSE-IgnoreStart
// Every SPDX identifier below is a string this gate MATCHES ON. None of them is a licence
// declaration for this file, which is proprietary by REUSE.toml's `scripts/**` glob like the
// rest of scripts/. Without these markers REUSE reads the first literal as this file's own tag
// and the compliance job fails on a file nobody relicensed.
const PROPRIETARY_PACKAGES = ["packages/ui", "packages/db", "packages/logger", "apps/worker"];
// npm's own word for "no licence granted". Kept alongside the SPDX ref because the two say the
// same thing to different readers — npm/pnpm, and REUSE.
const ACCEPTED_PACKAGE_LICENSE = new Set(["UNLICENSED", PROPRIETARY_SPDX]);

function checkProprietaryBoundary() {
  const failures = [];
  const reuse = existsSync("REUSE.toml") ? readFileSync("REUSE.toml", "utf-8") : "";

  for (const pkg of PROPRIETARY_PACKAGES) {
    const licensePath = `${pkg}/LICENSE`;
    if (!existsSync(licensePath)) {
      failures.push(`${pkg}: no LICENSE file. A proprietary package must say so where a reader lands.`);
    } else {
      const text = readFileSync(licensePath, "utf-8");
      if (!/all rights reserved/i.test(text)) {
        failures.push(`${pkg}/LICENSE: does not say "All rights reserved".`);
      }
      if (!text.includes(PROPRIETARY_SPDX)) {
        failures.push(`${pkg}/LICENSE: missing "SPDX-License-Identifier: ${PROPRIETARY_SPDX}".`);
      }
    }

    const manifestPath = `${pkg}/package.json`;
    if (existsSync(manifestPath)) {
      const declared = JSON.parse(readFileSync(manifestPath, "utf-8")).license;
      if (!ACCEPTED_PACKAGE_LICENSE.has(declared)) {
        failures.push(
          `${manifestPath}: license is ${JSON.stringify(declared)}; expected one of ${[...ACCEPTED_PACKAGE_LICENSE].join(" or ")}.`,
        );
      }
    }

    if (!reuse.includes(`"${pkg}/**"`) && !reuse.includes(`"${pkg.split("/")[0]}/**"`)) {
      failures.push(`REUSE.toml: no annotation glob covers ${pkg}.`);
    }

  }

  // An Apache-2.0 header inside a proprietary tree is a licence grant nobody decided to make —
  // failure 2 of the two this function exists for.
  //
  // **EPIC-901, 2026-09-18: this used to run over the four packages above and nothing else.**
  // `REUSE.toml` declares eight trees proprietary and ADR-002 says `docs/` is among them, and the
  // gate had never looked at four of them. The first monthly audit found **102 files** carrying
  // `SPDX-License-Identifier: Apache-2.0` inside them — 91 under `docs/`, 6 under `scripts/`, 2
  // under `apps/web`, 1 under `.githooks/`. REUSE's default precedence is `closest`, so a file's own
  // header beats the glob: those files were genuinely licensed Apache-2.0, in a repository that was
  // public for a period in September 2026, while `README.md` said in as many words that `docs/` and
  // `scripts/` are all rights reserved.
  //
  // The tree list is **read out of `REUSE.toml`** rather than written here, because a second copy
  // of a decision goes stale silently — which is the defect this comment is describing.
  const entries = [];
  for (const glob of proprietaryGlobs(reuse)) {
    const files = boundaryFiles((args) => execFileSync("git", args, { encoding: "utf-8" }), glob.replace(/\/\*\*$/, ""));
    for (const file of files) {
      let body;
      try {
        body = readFileSync(file, "utf-8");
      } catch {
        continue; // unreadable or binary; binary-files.mjs owns that failure
      }
      entries.push({ glob, file, body });
    }
  }
  for (const { glob, file } of apacheDeclarations(entries, HEADER_EXEMPT)) {
    failures.push(`${file}: declares Apache-2.0 inside a proprietary tree (${glob}).`);
  }

  if (failures.length > 0) {
    console.error(`License gate: the proprietary boundary has ${failures.length} problem(s):`);
    for (const line of failures) console.error(`  ${line}`);
    console.error("Source being visible is not a grant of a licence, and this gate is what keeps that true.");
    process.exit(1);
  }
  const globs = proprietaryGlobs(reuse);
  console.log(
    `License gate: proprietary boundary intact (${PROPRIETARY_PACKAGES.length} packages, ` +
      `${globs.length} trees, ${HEADER_EXEMPT.size} named header exemption(s)).`,
  );
}

checkProprietaryBoundary();
// REUSE-IgnoreEnd

function runLicensesList(args) {
  const raw = execFileSync("pnpm", ["licenses", "list", "--json", ...args], { encoding: "utf-8" });
  try {
    return JSON.parse(raw);
  } catch {
    // "No licenses in packages found" — a plain string pnpm prints instead of JSON when the
    // filtered scope has zero dependencies (true for every public package today).
    return {};
  }
}

function flatten(byLicense) {
  const rows = [];
  for (const [license, packages] of Object.entries(byLicense)) {
    for (const pkg of packages) {
      for (const version of pkg.versions) {
        rows.push({ name: pkg.name, version, license, author: pkg.author });
      }
    }
  }
  return rows;
}

function isAllowed(license) {
  // A dependency can declare a disjunction ("(MIT OR Apache-2.0)"); allowed if at least one
  // branch is on the allow-list — the consumer can always pick the permissive option.
  return license
    .split(/\s+OR\s+/i)
    .map((part) => part.replace(/[()]/g, "").trim())
    .some((part) => ALLOWED_LICENSES.has(part));
}

const publicScope = flatten(runLicensesList(["--prod", ...PUBLIC_PACKAGES.flatMap((p) => ["--filter", p])]));
const wholeRepoScope = flatten(runLicensesList([]));

const publicViolations = publicScope.filter((row) => !isAllowed(row.license));
const publicNames = new Set(publicScope.map((row) => `${row.name}@${row.version}`));
const privateOnlyViolations = wholeRepoScope.filter(
  (row) => !isAllowed(row.license) && !publicNames.has(`${row.name}@${row.version}`),
);

if (privateOnlyViolations.length > 0) {
  console.warn(`License gate: ${privateOnlyViolations.length} dependency license(s) outside the allow-list (private packages only — review, not a block):`);
  for (const row of privateOnlyViolations) {
    console.warn(`  ${row.name}@${row.version}: ${row.license}`);
  }
}

if (publicViolations.length > 0) {
  console.error(`License gate: ${publicViolations.length} public-package dependency license(s) outside the allow-list:`);
  for (const row of publicViolations) {
    console.error(`  ${row.name}@${row.version}: ${row.license}`);
  }
  console.error(`Allowed: ${[...ALLOWED_LICENSES].join(", ")}`);
  process.exit(1);
}

console.log(
  `License gate: clean. ${publicScope.length} public-package dependencies, ${wholeRepoScope.length} total in the workspace, ${privateOnlyViolations.length} private-only warning(s).`,
);

// --- SBOM (CycloneDX 1.5), covering the whole workspace's resolved dependencies ---
const outDir = process.argv.includes("--sbom") ? process.argv[process.argv.indexOf("--sbom") + 1] : undefined;
if (outDir) {
  mkdirSync(outDir, { recursive: true });
  const sbom = {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      component: { type: "application", name: "41prompts", version: process.env.SBOM_VERSION ?? "0.0.0" },
    },
    components: wholeRepoScope.map((row) => ({
      type: "library",
      name: row.name,
      version: row.version,
      purl: `pkg:npm/${row.name.replace(/^@/, "%40")}@${row.version}`,
      licenses: [{ license: { id: row.license } }],
      author: row.author,
    })),
  };
  const outFile = `${outDir}/sbom.cdx.json`;
  writeFileSync(outFile, JSON.stringify(sbom, null, 2));
  console.log(`SBOM written to ${outFile} (${sbom.components.length} components).`);
}
