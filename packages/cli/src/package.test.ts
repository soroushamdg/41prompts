// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * What `@41prompts/cli` is allowed to depend on (EPIC-053, C17).
 *
 * `CLAUDE.md` rule 11: a public package imports only the other public packages, Node builtins, or
 * its own declared dependencies — never `apps/*`, `packages/db`, `packages/ui` or `packages/logger`.
 *
 * **The manifest alone is not the test.** A `dependencies` block with two entries still passes while
 * a module three files down imports `@41prompts/db`, because the import would resolve through the
 * workspace's hoisted `node_modules` and nothing would complain until the package was published. So
 * the import graph is read as well — every `from "…"` in every source file — which is the half that
 * would actually catch it.
 *
 * `pnpm boundaries` (dependency-cruiser) covers the same ground from the other direction and is
 * already pointed at `packages/cli/src`. Two gates on one rule is deliberate: this one fails in the
 * package's own suite, in seconds, where somebody writing the import is looking.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(SRC, "..", "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  bin?: Record<string, string>;
  files?: string[];
};

const FORBIDDEN_PREFIXES = ["@41prompts/db", "@41prompts/ui", "@41prompts/logger", "@/", "apps/"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/**
 * Comments out, so prose is not read as code.
 *
 * The first version of this did not do it and immediately "found" two imports — one of them the
 * phrase *`"no database here" indistinguishable from "this code is broken"`* inside `exit.ts`'s
 * header, where `from "…"` is English. A scanner that reads documentation as source reports
 * violations that are sentences, which is a fast way to get a gate switched off.
 */
const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every module specifier this package imports, with the file it came from. */
function imports(): { file: string; specifier: string }[] {
  const found: { file: string; specifier: string }[] = [];
  for (const file of sourceFiles(SRC)) {
    const source = withoutComments(readFileSync(file, "utf8"));
    for (const match of source.matchAll(/\bfrom\s+"([^"]+)"|\bimport\s*\(\s*"([^"]+)"/g)) {
      found.push({ file, specifier: match[1] ?? match[2] ?? "" });
    }
  }
  return found;
}

describe("@41prompts/cli's dependencies", () => {
  it("declares only the two public packages it uses", () => {
    expect(manifest.dependencies).toEqual({
      "@41prompts/core": "workspace:*",
      "@41prompts/sdk": "workspace:*",
    });
  });

  it("imports nothing but those, Node builtins and its own files", () => {
    const external = imports()
      .map(({ specifier }) => specifier)
      .filter((specifier) => !specifier.startsWith("."))
      .filter((specifier) => !specifier.startsWith("node:"))
      .filter((specifier) => specifier !== "vitest");

    const allowed = new Set(["@41prompts/core", "@41prompts/core/fixtures", "@41prompts/sdk"]);
    expect([...new Set(external)].filter((specifier) => !allowed.has(specifier))).toEqual([]);
  });

  it("imports nothing proprietary — and the search can find one", () => {
    const offending = imports().filter(({ specifier }) =>
      FORBIDDEN_PREFIXES.some((prefix) => specifier.startsWith(prefix)),
    );
    expect(offending).toEqual([]);

    // The positive control. Without it this passes when `imports()` returns nothing at all — an
    // empty result and a clean result are the same assertion otherwise (lesson 8).
    expect(imports().length).toBeGreaterThan(20);
    const planted = "@41prompts/db/schema";
    expect(FORBIDDEN_PREFIXES.some((prefix) => planted.startsWith(prefix))).toBe(true);
  });

  it("ships a binary whose entry point is in the files it publishes", () => {
    // The stub's manifest pointed `bin` at `src/bin.ts` while `files` shipped only `dist`, so a
    // published package would have had no entry point at all. Found by reading it, not by a failure.
    const bin = manifest.bin?.["41p"];
    expect(bin).toBe("./dist/bin.js");
    expect(manifest.files).toContain("dist");
  });
});
