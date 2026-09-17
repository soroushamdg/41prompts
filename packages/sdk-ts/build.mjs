// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

/**
 * Build `@41prompts/sdk` (EPIC-052).
 *
 * ## Why this is a bundle and not `tsc`
 *
 * The published package has **no `dependencies` key** — `CLAUDE.md` rule 8 and the roadmap both say
 * zero dependencies — and it must not carry a second implementation of how an artifact is hashed or
 * how a variable is bound. `artifact/schema.ts` states the reason for the second constraint in as
 * many words: `buildHashOf` lives in core *"so that the two cannot disagree about what is hashed —
 * the failure mode of a second copy being that verification quietly always passes"*.
 *
 * Those two hold together only if *importing* and *depending* are different things, which they are
 * once there is a build step. `src/` imports `@41prompts/core` by name; esbuild inlines the handful
 * of reachable pure functions; the tarball has no dependency tree behind it. The alternative —
 * declaring core as a runtime dependency — would put 1.6 MB of segmenter, clustering, detectors and
 * compiler into the `node_modules` of an application that wants a string.
 *
 * `@41prompts/core` is therefore a **devDependency**. `package.test.ts` is what stops that from
 * being a claim: it reads the built output and fails if anything but a `node:` builtin survives.
 *
 * ## Three outputs
 *
 * - `dist/index.js` — ESM, unminified. Unminified on purpose: a customer reading a stack trace out
 *   of their own production logs should see function names, and the 15 KB Review line is about what
 *   their bundler emits rather than about what we ship them to read.
 * - `dist/index.cjs` — the same bundle for `require()`. Not every Node application is ESM, and an
 *   SDK that cannot be required is one a large part of the ICP cannot install.
 * - `dist/*.d.ts` — from `tsc --emitDeclarationOnly`. `package.test.ts` walks the closure from
 *   `index.d.ts` and fails if it reaches a type that is not this package's own, because a `.d.ts`
 *   naming `@41prompts/core` would be a dependency wearing a different hat.
 */
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");

rmSync(dist, { recursive: true, force: true });

const shared = {
  entryPoints: [join(here, "src", "index.ts")],
  bundle: true,
  platform: "node",
  target: "node20",
  // Everything the SDK reaches for is a builtin. Listing them keeps a stray npm import an error at
  // build time rather than a surprise inside the bundle.
  external: ["node:fs", "node:path", "node:os", "node:crypto"],
  logLevel: "warning",
};

await build({ ...shared, format: "esm", outfile: join(dist, "index.js") });
await build({ ...shared, format: "cjs", outfile: join(dist, "index.cjs") });

// Declarations last: a failed typecheck should not leave a half-built `dist` that looks complete.
execFileSync(
  process.execPath,
  [join(here, "..", "..", "node_modules", "typescript", "bin", "tsc"), "-p", join(here, "tsconfig.build.json"), "--emitDeclarationOnly"],
  { stdio: "inherit", cwd: here },
);
