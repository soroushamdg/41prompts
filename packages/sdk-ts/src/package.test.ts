// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * What this package actually ships (EPIC-052, C11, C12 and C16).
 *
 * **Everything here reads the built output**, not the source and not a field in isolation. The
 * claims under test — zero dependencies, under 15 KB, resolves to `dist` when published — are all
 * claims about a tarball, and each of them is the kind that stays true in a manifest long after it
 * has stopped being true in the artifact.
 *
 * It builds first, every time. A test that asserted about a `dist/` somebody happened to leave
 * behind would be asserting about an afternoon rather than about this commit, and `turbo run test`
 * has no ordering that guarantees otherwise in a fresh clone.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { build as esbuild } from "esbuild";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { SDK_VERSION } from "./version.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");

/** 15 KB, and KB means 1024. The Review line of `docs/roadmap.md`'s EPIC-052 entry. */
const BUDGET_BYTES = 15 * 1024;

interface Manifest {
  version: string;
  main: string;
  types: string;
  files: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  devDependencies: Record<string, string>;
  publishConfig: { main: string; types: string; exports: Record<string, Record<string, string>> };
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as Manifest;

beforeAll(() => {
  execFileSync(process.execPath, [join(root, "build.mjs")], { cwd: root, stdio: "pipe" });
}, 120_000);

describe("zero dependencies", () => {
  it("declares none of the three kinds of dependency", () => {
    expect(manifest.dependencies).toBeUndefined();
    expect(manifest.peerDependencies).toBeUndefined();
    expect(manifest.optionalDependencies).toBeUndefined();
    // The control: the package does have devDependencies, so the three assertions above are about
    // the keys being absent rather than about a manifest this test failed to read.
    expect(Object.keys(manifest.devDependencies).length).toBeGreaterThan(0);
    expect(manifest.devDependencies["@41prompts/core"]).toBe("workspace:*");
  });

  it("imports nothing but Node builtins, in both the ESM and the CommonJS bundle", () => {
    const esm = readFileSync(join(dist, "index.js"), "utf8");
    const cjs = readFileSync(join(dist, "index.cjs"), "utf8");

    const esmImports = [...esm.matchAll(/(?:^|\s)(?:import|export)[^;]*?from\s*"([^"]+)"/g)].map((m) => m[1] ?? "");
    const cjsRequires = [...cjs.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1] ?? "");

    for (const specifier of [...esmImports, ...cjsRequires]) {
      expect(specifier.startsWith("node:")).toBe(true);
    }
    // The control: there are imports to look at. An empty list would pass the loop above.
    expect(esmImports.length).toBeGreaterThan(0);
    expect(cjsRequires.length).toBeGreaterThan(0);
    // And `@41prompts/core` is genuinely inlined rather than left as an import.
    expect(esm).not.toContain('"@41prompts/core"');
    expect(esm).toContain("canonicalJson");
  });

  it("ships no declaration that names a package a consumer does not install", () => {
    // The declaration closure a consumer's TypeScript actually loads: `index.d.ts` and whatever it
    // reaches. A `.d.ts` importing `@41prompts/core` would be a dependency wearing a different hat —
    // the build would be fine and every consumer's typecheck would fail.
    const seen = new Set<string>();
    const queue = ["index.d.ts"];
    while (queue.length > 0) {
      const name = queue.pop() as string;
      if (seen.has(name)) continue;
      seen.add(name);
      const file = join(dist, name);
      expect(existsSync(file)).toBe(true);
      // Comments first. `tsc` copies the module's JSDoc into its declarations, and this package's
      // own doc comment contains a worked example that imports `@41prompts/sdk` — which this walk
      // read as a dependency until the strip was added.
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const match of text.matchAll(/from\s*"([^"]+)"/g)) {
        const specifier = match[1] ?? "";
        if (specifier.startsWith("./")) {
          queue.push(specifier.replace(/^\.\//, "").replace(/\.js$/, ".d.ts"));
        } else {
          throw new Error(`dist/${name} names "${specifier}", which a consumer of this package does not install`);
        }
      }
    }
    // The control: more than the entry point was walked.
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe("the bundle budget", () => {
  it(`is under ${BUDGET_BYTES} bytes minified`, async () => {
    const raw = readFileSync(join(dist, "index.js"));
    const minified = await esbuild({
      entryPoints: [join(dist, "index.js")],
      bundle: true,
      minify: true,
      format: "esm",
      platform: "node",
      external: ["node:fs", "node:path", "node:os", "node:crypto"],
      write: false,
      logLevel: "silent",
    });
    const bytes = minified.outputFiles?.[0]?.contents.byteLength ?? Number.POSITIVE_INFINITY;

    const gzipped = gzipSync(minified.outputFiles?.[0]?.contents ?? new Uint8Array()).byteLength;

    // Printed rather than only asserted: `docs/PROCESS.md` — paste the number, not the adjective.
    // Three numbers because three different people mean three different things by "bundle size",
    // and the assertion is against the strictest of them.
    console.log(
      `  bundle: ${raw.byteLength} B shipped (readable) · ${bytes} B minified · ${gzipped} B minified+gzip · budget ${BUDGET_BYTES} B`,
    );
    expect(bytes).toBeLessThan(BUDGET_BYTES);
  }, 60_000);
});

describe("what npm would publish", () => {
  it("puts dist in the tarball and leaves src out of it", () => {
    const packed = JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }),
    ) as [{ files: { path: string }[] }];
    const paths = (packed[0]?.files ?? []).map((f) => f.path);

    for (const required of ["dist/index.js", "dist/index.cjs", "dist/index.d.ts", "LICENSE", "NOTICE", "README.md"]) {
      expect(paths).toContain(required);
    }
    // EPIC-013's parked question, in the form it actually bites: the package used to name
    // `src/index.ts` as its `main` while shipping only `dist`, so a published install would have
    // resolved to a file that is not in the tarball.
    expect(paths.some((p) => p.startsWith("src/"))).toBe(false);

    for (const entry of [manifest.publishConfig.main, manifest.publishConfig.types, manifest.publishConfig.exports["."]?.["import"]]) {
      expect(paths).toContain((entry ?? "").replace(/^\.\//, ""));
    }
  }, 120_000);

  it("resolves to source inside the monorepo and to dist when published", () => {
    expect(manifest.main).toBe("./src/index.ts");
    expect(manifest.publishConfig.main).toBe("./dist/index.cjs");
    expect(manifest.publishConfig.exports["."]?.["import"]).toBe("./dist/index.js");
    expect(manifest.publishConfig.exports["."]?.["types"]).toBe("./dist/index.d.ts");
  });
});

describe("the version constant", () => {
  it("is the manifest's version, because the telemetry header carries it", () => {
    expect(SDK_VERSION).toBe(manifest.version);
  });
});
