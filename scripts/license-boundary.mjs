#!/usr/bin/env node
// The pure half of `scripts/license-gate.mjs`'s proprietary boundary: what licence a file declares,
// which trees REUSE.toml calls proprietary, and which files inside them are a grant by accident.
//
// **It is a separate module so it can be tested.** `license-gate.mjs` runs its gate at import time
// and calls `process.exit`, so importing it to exercise one function would run `pnpm licenses list`
// twice and take the process down. EPIC-901 needed a control that feeds this logic a file that IS
// an accidental grant and watches it come back — which is not a thing the old loop-inside-the-gate
// could ever be given.
//
// **Every SPDX tag and REUSE marker below is assembled from fragments, deliberately.** REUSE reads
// both by scanning text and has no idea a string literal is a string literal. Spelling one out here
// would make this file declare somebody else's licence, or silently close a span. That is not
// hypothetical: writing them plainly inside `license-gate.mjs` closed its own span 99 lines early
// and made `reuse lint` report the gate as having no licensing information at all.
//
// This file is proprietary under REUSE.toml's `scripts/**` glob, like the rest of `scripts/`.

const SPDX_TAG = `SPDX-License${"-Identifier:"}`;
const PERMISSIVE = "Apache-2.0";

export const PROPRIETARY_SPDX = `LicenseRef-41${"Prompts-Proprietary"}`;

// A file's declaration is the FIRST tag on a line of its own, after the spans REUSE is told to
// skip — which is REUSE's own algorithm, reproduced rather than approximated. Any occurrence of the
// string is not the same question, and the two differ constantly in this repository:
//
//   - `docs/epics/EPIC-000-repo-scaffold.md` mentions what a public file's header looks like,
//     mid-sentence and inside backticks. That is prose ABOUT a header. EPIC-056 shipped a check
//     that matched exactly this shape and the gate caught it (`7f8b67f`).
//   - `docs/epics/plan-EPIC-000.md` had no header of its own and a fenced code block showing what
//     one looks like. REUSE read that block as the file's declaration, so a documentation example
//     was licensing the file — and `reuse spdx` reported the plan as permissively licensed.
//
// `apps/web/license-gate-boundary.test.ts` exercises both shapes, and asserts over the real tree in
// both directions — no proprietary-tree file declares the permissive licence, and a public-package
// file still does. **It does not run `reuse` itself**: that needs `uv` and twenty seconds, and a
// check that skips when a tool is absent reads as a pass. The one-off cross-check — this function's
// answer over the whole tree against `reuse spdx`'s, which agreed exactly — is in EPIC-901's report.
const IGNORE_SPAN = new RegExp(`REUSE-Ignore${"Start"}[\\s\\S]*?REUSE-Ignore${"End"}`, "g");
const DECLARATION = new RegExp(`^[\\s#/*<!-]*${SPDX_TAG}[ \\t]*(\\S+?)[ \\t]*(?:-->|\\*/)?[ \\t]*$`, "m");

export function declaredLicense(body) {
  const m = body.replace(IGNORE_SPAN, "").match(DECLARATION);
  return m ? m[1] : null;
}

// The `path` list of the `[[annotations]]` block that declares the proprietary licence. Read out of
// REUSE.toml rather than written down here, because a second copy of a decision goes stale in
// silence — and this particular decision had already grown a gap: `REUSE.toml` declared eight trees
// proprietary and the gate looked at four packages.
export function proprietaryGlobs(reuseToml) {
  const blocks = reuseToml.split(/^\[\[annotations\]\]$/m).slice(1);
  const block = blocks.find((b) => new RegExp(`${SPDX_TAG.replace(":", "")}\\s*=\\s*"${PROPRIETARY_SPDX}"`).test(b));
  if (!block) return [];
  const list = block.match(/path\s*=\s*\[([\s\S]*?)\]/);
  if (!list) return [];
  return [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((p) => p.endsWith("/**"));
}

// Files inside a proprietary tree that carry a permissive header on purpose, or that this
// repository's own rules forbid an agent from editing. **Named one by one, never by pattern** — a
// pattern-shaped exemption is satisfiable by accident, and this list is the only thing standing
// between "we decided to publish this" and "somebody pasted a header".
// `apps/web/license-gate-boundary.test.ts` asserts the list is exactly these four entries.
export const HEADER_EXEMPT = new Set([
  // EPIC-901: `CLAUDE.md`'s "Never touch without an explicit instruction" list covers
  // `docs/decisions/*`. These four declare the permissive licence and should declare the
  // proprietary one; correcting them is Soroush's, and EPIC-901's report §8 asks him to.
  "docs/decisions/ADR-005-build-artifact.md",
  "docs/decisions/ADR-006-sdk-public-api.md",
  "docs/decisions/GATE-3.md",
  "docs/decisions/GATE-5.md",
]);

// `entries` is [{ glob, file, body }]. Returns the ones that are a grant nobody decided to make.
export function apacheDeclarations(entries, exempt = HEADER_EXEMPT) {
  return entries.filter((e) => !exempt.has(e.file) && declaredLicense(e.body) === PERMISSIVE);
}

// Every file this boundary should judge: tracked, staged, and untracked-but-not-ignored.
//
// **`git ls-files` alone is not that set, and this was found by the control rather than by reading
// the code.** EPIC-901 added a new proprietary file, flipped its header to the permissive one to
// watch the real-tree assertion fail, and it **passed** — because the file was new and `ls-files`
// reads the index. That is `docs/PROCESS.md`'s failure 2 from "Local green is not CI green", where
// `binary-files.mjs` reported "486 checked" over a set that did not include the file with the NUL
// byte in it. `scripts/binary-files.mjs` was fixed the same way and its comment has the long
// version; this is the same three-way union against the same trap.
//
// `--exclude-standard` is what keeps `node_modules` and `dist` out without maintaining an ignore
// list here.
export function boundaryFiles(git, prefix) {
  const paths = (args) =>
    git([...args, "--", prefix])
      .split("\0")
      .filter(Boolean);
  return [
    ...new Set([
      ...paths(["ls-files", "-z"]),
      ...paths(["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"]),
      ...paths(["ls-files", "-z", "--others", "--exclude-standard"]),
    ]),
  ].sort();
}
