#!/usr/bin/env node
// EPIC-007 decision 4: a licence outside the allow-list fails the build for a public package's
// own dependency closure (packages/core, packages/cli, packages/sdk-ts — sdks/python is a
// separate, non-pnpm ecosystem and currently ships zero dependencies per pyproject.toml, so it
// isn't checked here); the same finding anywhere else in the workspace is a warning, not a block.
// Also emits the CycloneDX SBOM `pnpm sbom` uses (see .github/workflows/compliance.yml).
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const PUBLIC_PACKAGES = ["@41prompts/core", "@41prompts/cli", "@41prompts/sdk-ts"];

// Permissive-only (decision 4's exact list). Pnpm reports the SPDX identifier as declared in
// each package's own package.json `license` field, which is why both hyphen styles for BSD show
// up in practice.
const ALLOWED_LICENSES = new Set(["MIT", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "ISC", "0BSD", "Unlicense", "Python-2.0"]);

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
