// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * What `@41prompts/core` would publish (EPIC-052, C16).
 *
 * ## EPIC-013's parked question, answered here
 *
 * EPIC-013 recorded that core is resolved two ways in this repository — `apps/web` reads its built
 * `dist` through a Turbopack alias while `tsc` and Vitest read its source through `main` — and
 * handed EPIC-052 the job of settling the entry points *"for publication"*.
 *
 * The answer is `publishConfig`. `main`, `types` and `exports` keep naming **source**, so every test
 * and every typecheck in the monorepo resolves core without a build step; npm applies the
 * `publishConfig` overrides when the tarball is made, so the published package names **dist**. One
 * package, two resolutions, neither of them a lie.
 *
 * The alias stays, and that is the rest of the answer: it exists because Turbopack cannot map core's
 * NodeNext `./x.js` specifiers onto the `./x.ts` files on disk, which has nothing to do with
 * publication and is unchanged by it.
 *
 * This test is IO in a package whose rule is "no IO" — `CLAUDE.md` rule 1 and the `core-is-pure`
 * boundary, which excludes `*.test.ts` deliberately for cases like this one.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

interface Manifest {
  main: string;
  types: string;
  exports: Record<string, string>;
  files: string[];
  dependencies?: Record<string, string>;
  publishConfig: { main: string; types: string; exports: Record<string, Record<string, string>> };
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;

describe("the published entry points", () => {
  it("names source in the monorepo", () => {
    expect(manifest.main).toBe("./src/index.ts");
    expect(manifest.exports["."]).toBe("./src/index.ts");
    expect(manifest.exports["./fixtures"]).toBe("./src/fixtures.ts");
  });

  it("names dist when published, for every entry the monorepo has", () => {
    expect(manifest.publishConfig.main).toBe("./dist/index.js");
    expect(manifest.publishConfig.types).toBe("./dist/index.d.ts");

    // Every subpath the monorepo exports has a published counterpart. A subpath present in one map
    // and missing from the other is an import that works here and 404s for a customer — which is the
    // shape of the defect `next.config.ts` already documents for `@41prompts/core/fixtures`.
    expect(Object.keys(manifest.publishConfig.exports).sort()).toEqual(Object.keys(manifest.exports).sort());
    for (const [subpath, target] of Object.entries(manifest.publishConfig.exports)) {
      expect(target["default"]).toMatch(/^\.\/dist\//);
      expect(target["types"]).toMatch(/^\.\/dist\/.*\.d\.ts$/);
      expect(subpath.startsWith(".")).toBe(true);
    }
  });

  it("still has no dependencies at all", () => {
    // `CLAUDE.md`: core is "pure TS, zero dependencies, no DOM, no IO". The boundary rule enforces
    // it for imports; this is the manifest half of the same claim.
    expect(manifest.dependencies).toBeUndefined();
  });

  it("ships dist and not src", () => {
    expect(manifest.files).toContain("dist");
    expect(manifest.files.some((entry) => entry.startsWith("src"))).toBe(false);
  });
});
