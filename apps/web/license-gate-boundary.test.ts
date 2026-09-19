// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **The proprietary boundary, and the 102 files that were licensed permissively by accident.**
 *
 * `scripts/license-gate.mjs` has treated a permissive SPDX header inside a proprietary package as a
 * hard failure since EPIC-007 — over four packages, and nothing else. `REUSE.toml` declares nine
 * trees proprietary and ADR-002 §1 names `docs/` among them.
 *
 * EPIC-901's first monthly audit read `reuse spdx` per tree and found **102 files inside proprietary
 * trees declaring Apache-2.0 in their own header**: 91 under `docs/`, 6 under `scripts/`, 2 under
 * `apps/web`, 1 under `.githooks/`, plus `SECURITY.md` and `TRADEMARKS.md`, which are deliberate
 * because `scripts/mirror-dry-run.sh` ships both to the public repository.
 *
 * REUSE's default precedence is `closest`, so **a file's own header beats the glob**. Those files
 * were genuinely Apache-2.0 while `README.md` said in as many words that `docs/` and `scripts/` are
 * all rights reserved — in a repository that was public for a period in September 2026. Closing it
 * again does not un-publish what was seen, which is why this is a test and not a note.
 *
 * ## Why the logic moved out of the gate
 *
 * The check had no control. A loop over `readFileSync` inside `checkProprietaryBoundary` can be
 * asserted to find nothing, and "finds nothing" is what a broken check also says. It now lives in
 * `scripts/license-boundary.mjs` so it can be handed a file that IS a grant by accident and watched
 * to see it come back.
 *
 * ## The two failures the naive version has, both of which happened here
 *
 * 1. **Prose about a header is not a header.** `docs/epics/EPIC-000-repo-scaffold.md` says
 *    mid-sentence what a public file's header looks like. EPIC-056 shipped a check that matched
 *    exactly this shape and the gate caught it (`7f8b67f`) — this is the same trap, one epic later.
 * 2. **`git ls-files` reads the index, so a new file is invisible.** The real-tree assertion below
 *    was verified by flipping a header and watching it fail — and it **passed**, because the file
 *    was new and untracked. `docs/PROCESS.md`'s failure 2, where `binary-files.mjs` reported
 *    "486 checked" over a set that did not contain the file with the NUL byte in it.
 *
 * ## Why this runs the module in a child process
 *
 * `turbo boundaries` refuses an import that leaves `@41prompts/web`, and it is right to: CLAUDE.md
 * rule 11 makes that guard load-bearing, and weakening it for a test would be the wrong trade.
 * `apps/web/binary-files.test.ts` runs its script as a subprocess for the same reason. One child
 * process runs every scenario and returns JSON, rather than one per assertion.
 */

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MODULE = pathToFileURL(join(REPO, "scripts/license-boundary.mjs")).href;

const PERMISSIVE = "Apache-2.0";
const PROPRIETARY = "LicenseRef-41Prompts-Proprietary";
// Assembled so this file does not itself declare somebody else's licence — the trap described in
// `scripts/license-boundary.mjs`'s header, which cost `reuse lint` a red run during EPIC-901.
const TAG = `SPDX-License${"-Identifier:"} `;
const IGNORE_START = `REUSE-Ignore${"Start"}`;
const IGNORE_END = `REUSE-Ignore${"End"}`;

const SYNTHETIC = {
  markdown: `<!--\nSPDX-FileCopyrightText: x\n${TAG}${PROPRIETARY}\n-->\n# Title`,
  slashes: `// ${TAG}${PERMISSIVE}\nexport const a = 1;`,
  hash: `#!/bin/sh\n# ${TAG}${PERMISSIVE}\necho hi`,
  blockComment: `/*\n * ${TAG}${PERMISSIVE}\n */`,
  htmlOneLine: `<!-- ${TAG}${PERMISSIVE} -->`,
  prose: `Every public source file carries \`// ${TAG}${PERMISSIVE}\` at the top.`,
  exampleAfterHeader: `<!--\n${TAG}${PROPRIETARY}\n-->\n\nAn example:\n\n\`\`\`\n// ${TAG}${PERMISSIVE}\n\`\`\`\n`,
  inIgnoredSpan: `// ${IGNORE_START}\n// ${TAG}${PERMISSIVE}\n// ${IGNORE_END}\n// ${TAG}${PROPRIETARY}\n`,
  none: "# Just a document\n\nWith words in it.\n",
};

const ENTRIES = [
  { glob: "docs/**", file: "docs/a-grant-by-accident.md", body: `<!--\n${TAG}${PERMISSIVE}\n-->` },
  { glob: "docs/**", file: "docs/correct.md", body: `<!--\n${TAG}${PROPRIETARY}\n-->` },
  { glob: "docs/**", file: "docs/prose.md", body: `It carries \`${TAG}${PERMISSIVE}\` at the top.` },
  { glob: "docs/**", file: "docs/decisions/GATE-3.md", body: `<!--\n${TAG}${PERMISSIVE}\n-->` },
];

const NO_PROPRIETARY_BLOCK = '[[annotations]]\npath = ["a/**"]\nSPDX-License-Identifier = "MIT"\n';

type Probe = {
  declared: Record<keyof typeof SYNTHETIC, string | null>;
  globs: string[];
  globsWhenNoBlockDeclaresIt: string[];
  flagged: string[];
  flaggedWithNoExemptions: string[];
  headerExempt: string[];
  realTree: { violations: string[]; scanned: number; exemptStillGrants: string[]; publicPackage: string | null };
};

const SOURCE = `
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import * as m from ${JSON.stringify(MODULE)};

const REPO = ${JSON.stringify(REPO)};
const SYNTHETIC = ${JSON.stringify(SYNTHETIC)};
const ENTRIES = ${JSON.stringify(ENTRIES)};
const reuse = readFileSync(join(REPO, "REUSE.toml"), "utf-8");
const git = (args) => execFileSync("git", args, { cwd: REPO, encoding: "utf-8" });

// The same three-way file set the gate scans: tracked, staged, untracked-but-not-ignored.
const globs = m.proprietaryGlobs(reuse);
const entries = [];
for (const glob of globs) {
  for (const file of m.boundaryFiles(git, glob.replace(/\\/\\*\\*$/, ""))) {
    try {
      entries.push({ glob, file, body: readFileSync(join(REPO, file), "utf-8") });
    } catch {
      /* binary or gone; scripts/binary-files.mjs owns that failure */
    }
  }
}

process.stdout.write(
  JSON.stringify({
    declared: Object.fromEntries(Object.entries(SYNTHETIC).map(([k, v]) => [k, m.declaredLicense(v)])),
    globs,
    globsWhenNoBlockDeclaresIt: m.proprietaryGlobs(${JSON.stringify(NO_PROPRIETARY_BLOCK)}),
    flagged: m.apacheDeclarations(ENTRIES).map((e) => e.file),
    flaggedWithNoExemptions: m.apacheDeclarations(ENTRIES, new Set()).map((e) => e.file),
    headerExempt: [...m.HEADER_EXEMPT].sort(),
    realTree: {
      violations: m.apacheDeclarations(entries).map((e) => e.file),
      scanned: entries.length,
      exemptStillGrants: [...m.HEADER_EXEMPT].filter(
        (f) => m.declaredLicense(readFileSync(join(REPO, f), "utf-8")) === "Apache-2.0",
      ),
      publicPackage: m.declaredLicense(readFileSync(join(REPO, "packages/core/src/index.ts"), "utf-8")),
    },
  }),
);
`;

const probe: Probe = JSON.parse(
  execFileSync(process.execPath, ["--input-type=module", "-e", SOURCE], {
    cwd: REPO,
    encoding: "utf-8",
    maxBuffer: 32 * 1024 * 1024,
  }),
);

describe("declaredLicense — what a file actually declares", () => {
  it("reads a header in every comment syntax this repository uses", () => {
    expect(probe.declared.markdown).toBe(PROPRIETARY);
    expect(probe.declared.slashes).toBe(PERMISSIVE);
    expect(probe.declared.hash).toBe(PERMISSIVE);
    expect(probe.declared.blockComment).toBe(PERMISSIVE);
    expect(probe.declared.htmlOneLine).toBe(PERMISSIVE);
  });

  it("is not fooled by prose that mentions a header mid-sentence", () => {
    expect(probe.declared.prose).toBeNull();
  });

  it("takes the FIRST declaration, so a later example cannot relicense a file", () => {
    expect(probe.declared.exampleAfterHeader).toBe(PROPRIETARY);
  });

  it("skips the spans REUSE is told to skip", () => {
    expect(probe.declared.inIgnoredSpan).toBe(PROPRIETARY);
  });

  it("returns null for a file with no declaration at all", () => {
    expect(probe.declared.none).toBeNull();
  });
});

describe("proprietaryGlobs — read from REUSE.toml, never written down twice", () => {
  it("finds every tree the licence declaration covers", () => {
    // `.githooks/**` was added by EPIC-901: the tree was covered by no glob at all and its one file
    // satisfied REUSE with a permissive header of its own.
    expect(probe.globs).toEqual(
      expect.arrayContaining([".github/**", ".githooks/**", "apps/**", "docs/**", "infra/**", "scripts/**"]),
    );
  });

  it("finds more than the four packages the gate used to check", () => {
    expect(probe.globs.length).toBeGreaterThan(4);
  });

  it("returns nothing when no block declares the proprietary licence", () => {
    expect(probe.globsWhenNoBlockDeclaresIt).toEqual([]);
  });
});

describe("apacheDeclarations — the control the old check could not have", () => {
  it("returns the file that is a grant nobody decided to make", () => {
    expect(probe.flagged).toEqual(["docs/a-grant-by-accident.md"]);
  });

  it("honours the exemption list, and honours it by exact path", () => {
    expect(probe.flaggedWithNoExemptions).toEqual(["docs/a-grant-by-accident.md", "docs/decisions/GATE-3.md"]);
  });
});

describe("the real tree", () => {
  it("has no file in a proprietary tree declaring a permissive licence", () => {
    expect(probe.realTree.violations).toEqual([]);
  });

  it("scans a real number of files, so an empty result is not an empty scan", () => {
    // The assertion above passes trivially if the scan is empty — which is what a broken glob
    // parser, a wrong cwd or a renamed tree would produce. This is the control for that.
    expect(probe.realTree.scanned).toBeGreaterThan(500);
  });

  it("still finds permissive declarations where they belong", () => {
    // The other direction: `declaredLicense` returning null for everything would pass both of the
    // above. A public package must still read as permissive.
    expect(probe.realTree.publicPackage).toBe(PERMISSIVE);
  });

  it("exempts exactly the four files under docs/decisions/, and each still needs it", () => {
    // Every exemption is a file that IS a grant by accident and is waiting on a person. If one ever
    // stops being that — corrected, deleted, renamed — the list has to shrink, and this is what
    // says so. `CLAUDE.md` forbids an unattended run from editing `docs/decisions/*`.
    expect(probe.headerExempt).toEqual([
      "docs/decisions/ADR-005-build-artifact.md",
      "docs/decisions/ADR-006-sdk-public-api.md",
      "docs/decisions/GATE-3.md",
      "docs/decisions/GATE-5.md",
    ]);
    expect(probe.realTree.exemptStillGrants).toEqual(probe.headerExempt);
  });
});
