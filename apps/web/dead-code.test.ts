// SPDX-FileCopyrightText: 2026 41Prompts Inc.
// SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **`scripts/dead-code.mjs` — an exported value nothing else in the repository names.**
 *
 * EPIC-900's survey found 43 of them across 602 source files, three named nowhere at all. Nothing
 * failed and nothing was slower; a module's export list had simply stopped being a statement of
 * what that module offers. `docs/roadmap.md` schedules the sweep that finds this "every third
 * sprint", which is three runs a year against something created daily — so the epic's deliverable
 * is the gate rather than the sweep.
 *
 * The properties worth testing are therefore not "does it find things". They are the four edges
 * where a check of this shape silently stops working:
 *
 * 1. **an export used only inside its own file is still a finding** — that is the whole class;
 * 2. **prose is not a use**, neither a `.md` file nor a comment inside a `.ts` one. This is not
 *    hypothetical: the first real run reported 35 where the survey had found 39, and the four
 *    missing ones were held alive by sentences — three by the epic file written minutes earlier,
 *    which is to say *the document describing the dead code had hidden it from the gate*;
 * 3. **`ALLOWED` is checked in both directions** — an entry that no longer describes an orphan
 *    fails, because a stale exemption is how a check quietly stops catching what it exists for
 *    (`docs/security/audit-baseline.json`, `HEADER_EXEMPT` in `scripts/license-gate.mjs`);
 * 4. **the convention class holds** — Next.js and Sentry call `generateMetadata`, `GET`,
 *    `middleware` and `onRequestError` by name rather than importing them. If that class ever stops
 *    covering its cases, the symptom is those names appearing in `ALLOWED` one at a time, so the
 *    real tree is asserted to carry none of them.
 *
 * **The module runs in a child process** because `turbo boundaries` refuses an import that leaves
 * `@41prompts/web`, and it is right to — `CLAUDE.md` rule 11 makes that guard load-bearing.
 * `apps/web/audit.test.ts` and `apps/web/binary-files.test.ts` do the same, for the same reason.
 */

const REPO = join(fileURLToPath(new URL(".", import.meta.url)), "..", "..");
const MODULE = pathToFileURL(join(REPO, "scripts/dead-code.mjs")).href;

/** One exported value, used by nothing. The base case every other fixture varies. */
const LONE = { "packages/p/src/a.ts": "export const ORPHAN = 1;\n" };

const FIXTURES: Record<string, Record<string, string>> = {
  lone: LONE,

  usedByAnotherFile: {
    ...LONE,
    // `b.ts` exports nothing, so the only thing this fixture can report is `ORPHAN`.
    "packages/p/src/b.ts": 'import { ORPHAN } from "./a.js";\nconsole.log(ORPHAN);\n',
  },

  // The class this gate exists for. The keyword is the only thing making it look like a surface.
  usedOnlyInsideItsOwnFile: {
    "packages/p/src/a.ts": "export const ORPHAN = 1;\nexport function seen() {\n  return ORPHAN + 1;\n}\n",
    "packages/p/src/b.ts": 'import { seen } from "./a.js";\nconsole.log(seen());\n',
  },

  // Prose, twice: a document, and a comment inside code.
  namedOnlyInAMarkdownFile: { ...LONE, "docs/notes.md": "`ORPHAN` is the one to look at.\n" },
  namedOnlyInAComment: {
    ...LONE,
    "packages/p/src/b.ts": "// ORPHAN is the one to look at.\nconsole.log(2);\n",
  },

  // A type alias used once, inline, in its own file is not debt — and there are 113 of them.
  typesAreNotChecked: {
    "packages/p/src/a.ts": "export type Shape = { a: number };\nexport interface Other { b: string }\nconst x: Shape = { a: 1 };\nconsole.log(x);\n",
  },

  // Next.js and Sentry call these; nothing imports them. `default` is not matched at all.
  conventionNames: {
    "apps/web/app/x/route.ts": "export async function GET() {\n  return new Response();\n}\n",
    "apps/web/app/x/page.tsx": "export function generateMetadata() {\n  return {};\n}\nexport default function Page() {\n  return null;\n}\n",
    "apps/web/middleware.ts": "export function middleware() {\n  return undefined;\n}\n",
    "apps/web/instrumentation.ts": "export function onRequestError() {\n  return undefined;\n}\n",
  },

  // The real shape in packages/core/src/detect/contradiction.ts: a doc block between the keyword
  // and the declaration. Valid TypeScript, genuinely exported, and only visible if comments are
  // blanked in place rather than deleted.
  docBlockBetweenExportAndConst: {
    "packages/p/src/a.ts": "export /**\n * why\n */\nconst ORPHAN = 1;\n",
  },

  // mirror/ is the public tree's overlay, read by a repository that does not exist here.
  mirrorIsNotScanned: { "mirror/packages/p/src/a.ts": "export const ORPHAN = 1;\n" },
};

const ALLOW_ORPHAN = [{ file: "packages/p/src/a.ts", name: "ORPHAN", why: "a reason" }];

/** Each scenario is [fixture, allowed]. */
const SCENARIOS: Record<string, [string, Array<{ file: string; name: string; why: string }>]> = {
  notAllowed: ["lone", []],
  allowed: ["lone", ALLOW_ORPHAN],
  usedByAnotherFile: ["usedByAnotherFile", []],
  usedOnlyInsideItsOwnFile: ["usedOnlyInsideItsOwnFile", []],
  namedOnlyInAMarkdownFile: ["namedOnlyInAMarkdownFile", []],
  namedOnlyInAComment: ["namedOnlyInAComment", []],
  typesAreNotChecked: ["typesAreNotChecked", []],
  conventionNames: ["conventionNames", []],
  docBlockBetweenExportAndConst: ["docBlockBetweenExportAndConst", []],
  mirrorIsNotScanned: ["mirrorIsNotScanned", []],
  staleBecauseItIsGone: ["typesAreNotChecked", ALLOW_ORPHAN],
  staleBecauseSomethingNamesItNow: ["usedByAnotherFile", ALLOW_ORPHAN],
};

type Run = { findings: string[]; stale: Array<{ name: string; reason: string }> };
type Probe = {
  scenarios: Record<keyof typeof SCENARIOS, Run>;
  convention: string[];
  allowedNames: string[];
};

const SOURCE = `
import * as m from ${JSON.stringify(MODULE)};
const FIXTURES = ${JSON.stringify(FIXTURES)};
const SCENARIOS = ${JSON.stringify(SCENARIOS)};

const run = ([fixture, allowed]) => {
  const tree = FIXTURES[fixture];
  const r = m.deadCode({ files: Object.keys(tree), read: (f) => tree[f], allowed });
  return {
    findings: r.findings.map((f) => f.name).sort(),
    stale: r.stale.map((s) => ({ name: s.name, reason: s.reason })),
  };
};

process.stdout.write(
  JSON.stringify({
    scenarios: Object.fromEntries(Object.entries(SCENARIOS).map(([k, v]) => [k, run(v)])),
    convention: [...m.CONVENTION],
    allowedNames: m.ALLOWED.map((a) => a.name),
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

describe("what fires", () => {
  it("an exported value nothing else names is a finding", () => {
    expect(probe.scenarios.notAllowed.findings).toEqual(["ORPHAN"]);
  });

  it("the same value is silent once another file names it — the control for the case above", () => {
    expect(probe.scenarios.usedByAnotherFile.findings).toEqual([]);
  });

  it("an export used only inside its own file is still a finding, which is the whole class", () => {
    // `seen` is imported by b.ts and is correctly silent; `ORPHAN` is used on the line below its
    // own declaration and is not. The pair is deliberate: without `seen`, this fixture would pass
    // for the wrong reason if the gate had simply stopped working.
    expect(probe.scenarios.usedOnlyInsideItsOwnFile.findings).toEqual(["ORPHAN"]);
  });

  it("a doc block between `export` and `const` does not hide the declaration", () => {
    expect(probe.scenarios.docBlockBetweenExportAndConst.findings).toEqual(["ORPHAN"]);
  });
});

describe("prose is not a use", () => {
  it("a Markdown file naming it changes nothing", () => {
    // The first real run reported 35 findings where the survey had found 39. Three of the four
    // missing were named in the epic file describing them, written minutes earlier.
    expect(probe.scenarios.namedOnlyInAMarkdownFile.findings).toEqual(["ORPHAN"]);
  });

  it("a comment inside another source file changes nothing either", () => {
    // The other two: `snapshotNow` and `withFakeJudge`, each held alive by one sentence — and then,
    // one fix later, by this gate's own header naming them as the examples. `forbidden-words.mjs`
    // learned the same thing first: "this file's own comments would otherwise flag themselves".
    expect(probe.scenarios.namedOnlyInAComment.findings).toEqual(["ORPHAN"]);
  });
});

describe("what is deliberately not checked", () => {
  it("types and interfaces are not findings", () => {
    expect(probe.scenarios.typesAreNotChecked.findings).toEqual([]);
  });

  it("names a framework calls rather than imports are not findings", () => {
    expect(probe.scenarios.conventionNames.findings).toEqual([]);
  });

  it("mirror/ is not scanned — it is read by a repository that does not exist here", () => {
    expect(probe.scenarios.mirrorIsNotScanned.findings).toEqual([]);
  });
});

describe("ALLOWED, in both directions", () => {
  it("an entry silences its finding", () => {
    expect(probe.scenarios.allowed.findings).toEqual([]);
    expect(probe.scenarios.allowed.stale).toEqual([]);
  });

  it("an entry whose export has gone is stale, and stale fails the run", () => {
    expect(probe.scenarios.staleBecauseItIsGone.stale).toEqual([
      { name: "ORPHAN", reason: "no such exported value any more" },
    ]);
  });

  it("an entry whose export something now names is stale too, for the other reason", () => {
    // The direction that is easy to ship one-way. An exemption still listed for something that has
    // come back into use is not harmless: it will silence that name again, for a reason nobody
    // wrote down, the next time it goes quiet.
    expect(probe.scenarios.staleBecauseSomethingNamesItNow.stale).toEqual([
      { name: "ORPHAN", reason: "something else names it now, so the exemption does nothing" },
    ]);
  });
});

describe("the real tree", () => {
  it("passes", () => {
    // Not `expect(findings).toEqual([])` against the module: this runs the gate the way CI does,
    // so a broken shebang, a bad exit code or a crash in `main` fails here too.
    expect(() =>
      execFileSync(process.execPath, ["scripts/dead-code.mjs"], { cwd: REPO, encoding: "utf-8" }),
    ).not.toThrow();
  });

  it("carries no CONVENTION name in ALLOWED", () => {
    // The symptom of the convention class quietly ceasing to cover its cases is those names
    // arriving in ALLOWED one at a time. This is the assertion that makes that loud.
    const convention = new Set(probe.convention);
    expect(probe.allowedNames.filter((n) => convention.has(n))).toEqual([]);
  });
});

describe("it runs everywhere it is supposed to", () => {
  // The wiring is one commit for this reason. `docs/AUTONOMOUS.md`: a mode claiming parity with CI
  // must run what CI runs and no more, so a check in one of the three and not the others is the
  // divergence that rule exists to stop — in either direction.
  const read = (p: string) => readFileSync(join(REPO, p), "utf-8");

  it.each([
    ["package.json's compliance script", "package.json"],
    [".github/workflows/compliance.yml", ".github/workflows/compliance.yml"],
    ["scripts/gates.mjs's CI step list", "scripts/gates.mjs"],
  ])("%s runs dead-code", (_label, path) => {
    expect(read(path)).toContain("dead-code");
  });

  it("package.json runs it from the compliance script, not merely as a script of its own", () => {
    const manifest = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(manifest.scripts["dead-code"]).toBe("node scripts/dead-code.mjs");
    expect(manifest.scripts.compliance).toContain("pnpm dead-code");
  });
});
