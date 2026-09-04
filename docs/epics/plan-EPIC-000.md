# Plan: EPIC-000 Repo scaffold (rev. 2026-09-04, after the specialist review)

Supersedes the first pass of this plan. Re-read for this revision: CLAUDE.md, ADR-002 (revised), ADR-003
(vocabulary, new), `docs/epics/CURRENT.md` (revised), `docs/reviews/2026-09-specialist-review.md`.

`docs/` already exists at the repo root — nothing to copy in.

## What changed since the first plan, and why

| # | Correction | Where it lands below |
|---|---|---|
| 1 | Licence is Apache-2.0, not MIT, on `core`, `sdk-ts`, `cli`, `sdks/python`. Each gets `LICENSE` + `NOTICE`. Root `LICENSES/`. | §2, §3 |
| 2 | SPDX header, first two lines, every source file under the four public paths. | §3 |
| 3 | `packages/sdk-ts` publishes as `@41prompts/sdk`; directory name unchanged. | §1, §4 |
| 4 | `resolve()` does not throw, TS or Python — returns a value and calls `onWarning`. Resolves the conflict from the first plan in favour of CLAUDE.md Rule 8, per instruction. | §4 |
| 5 | Public `package.json` shape is fixed exactly: `license`, `repository.directory`, `files`, `publishConfig` with `provenance`, `prepublishOnly` guard, no `private: true`. Private packages + root: `private` + `UNLICENSED`. | §4 |
| 6 | Boundary rule is allow-list, five named rules, fixes the first plan's blind spot on `packages/ui`. | §5 |
| 7 | Turborepo boundary tags (`public`/`private`), `turbo boundaries` folded into `pnpm lint`. | §5 |
| 8 | `packages/core` tsconfig: `"lib": ["ES2022"]`, no DOM — unchanged from the first plan, restated because it's load-bearing for rule `core-is-pure`. | §4 |
| 9 | Python: `dependencies = []`, `requires-python >= 3.12`, `license = "Apache-2.0"`, `license-files = ["LICENSE","NOTICE"]`. | §4 |
| 10 | `<legal entity>` is copied verbatim, literal angle brackets, everywhere a copyright holder is named. No invented company name. | §2, §3 |

One open item this revision surfaces (not a criterion, flagged rather than silently resolved): the epic's Scope
says root `LICENSES/LicenseRef-41Prompts-Proprietary.txt` has its "text in ADR-002 / licensing review" — neither
document actually contains proprietary licence body text, only the SPDX identifier name. `LICENSES/Apache-2.0.txt`
is the real, unambiguous upstream text — no issue there. For the proprietary file I'm using conventional, generic
"all rights reserved / proprietary" boilerplate (no specific legal claims invented, `<legal entity>` kept literal)
and calling this out in the report for the advisor to replace with real wording before EPIC-007 wires up
`REUSE.toml`. This isn't a `BLOCKER`: `LICENSES/` isn't in the Acceptance criteria list, only in Scope, and
`REUSE.toml` itself is explicitly Out of scope for EPIC-000.

---

## 1. Directory tree (deltas from the first plan)

Unchanged: `apps/web`, `apps/worker`, `packages/db`, `packages/ui`, all Turborepo/CI/Prettier/editorconfig
scaffolding, the `tsconfig.depcruise.json` mechanism (kept — item 6 confirms it's "the right fix for pnpm strict
linking").

```
41prompts-v2/
├── LICENSES/
│   ├── Apache-2.0.txt                       # verbatim upstream text
│   └── LicenseRef-41Prompts-Proprietary.txt # generic proprietary boilerplate — see open item above
├── turbo.json                               # + boundaries config (§5)
├── .dependency-cruiser.cjs                  # allow-list, 5 rules (§5)
├── tsconfig.depcruise.json                  # unchanged mechanism, now maps @41prompts/sdk too
├── packages/
│   ├── core/            # @41prompts/core — Apache-2.0
│   │   ├── LICENSE  NOTICE  README.md
│   │   ├── turbo.json                       # { "tags": ["public"] }
│   │   └── src/index.ts, index.test.ts      # SPDX header, first two lines
│   ├── sdk-ts/           # package name @41prompts/sdk, directory unchanged — Apache-2.0
│   │   ├── LICENSE  NOTICE  README.md
│   │   ├── turbo.json                       # { "tags": ["public"] }
│   │   └── src/index.ts, index.test.ts      # resolve() returns, never throws
│   ├── cli/              # @41prompts/cli — Apache-2.0
│   │   ├── LICENSE  NOTICE  README.md
│   │   ├── turbo.json                       # { "tags": ["public"] }
│   │   └── src/version.ts, version.test.ts, bin.ts   # SPDX headers
│   ├── db/               # @41prompts/db — private, unchanged from first plan
│   └── ui/               # @41prompts/ui — private, unchanged from first plan
├── apps/web, apps/worker  # private, unchanged from first plan
└── sdks/python/           # fortyone-prompts / import fortyone — Apache-2.0
    ├── LICENSE  NOTICE
    ├── pyproject.toml     # license = "Apache-2.0", license-files, dependencies = []
    └── fortyone/__init__.py, tests/test_resolve.py   # SPDX headers, "#" comment form
```

---

## 2. Licensing files

**`LICENSES/Apache-2.0.txt`** — the real Apache License 2.0 text, unmodified, from apache.org/licenses/LICENSE-2.0.txt.

**Per-package `LICENSE`** in `packages/core`, `packages/sdk-ts`, `packages/cli`, `sdks/python`: identical copy of
the same Apache-2.0 text (this is how Apache-2.0 is normally vendored per-package — a full copy, not a pointer).

**Per-package `NOTICE`**, verbatim as the epic specifies:
```
41Prompts
Copyright 2026 <legal entity>

This product includes software developed at 41Prompts (https://41prompts.ai).
```

**`LICENSES/LicenseRef-41Prompts-Proprietary.txt`** (generic boilerplate, flagged above):
```
41Prompts Proprietary Licence

Copyright 2026 <legal entity>. All rights reserved.

This software is proprietary and confidential. No licence, express or implied, is granted to
use, copy, modify, merge, publish, distribute, sublicense, or sell copies of this software
without the prior written permission of <legal entity>.
```

---

## 3. SPDX headers

First two lines of every `.ts`/`.tsx` file under `packages/core/src`, `packages/sdk-ts/src`, `packages/cli/src`
(tests included — the epic's grep command covers `src` unconditionally):
```
// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0
```
Python, `sdks/python/fortyone/**/*.py` (and any `.pyi`):
```
# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0
```
Verified at the end with the epic's own command:
```
grep -rL "SPDX-License-Identifier" packages/core/src packages/sdk-ts/src packages/cli/src sdks/python/fortyone
```
which must print nothing.

---

## 4. Package specifics

### `packages/core` — `@41prompts/core`
`"lib": ["ES2022"]`, no DOM (item 8 — this is also what makes rule `core-is-pure` meaningful: a DOM lib would let
core code reach for `fetch`/browser globals without the compiler ever seeing an explicit import to flag).
Zero dependencies. `sideEffects: false`.

### `packages/sdk-ts` — package name `@41prompts/sdk`, directory `packages/sdk-ts`
```ts
// SPDX-FileCopyrightText: 2026 <legal entity>
// SPDX-License-Identifier: Apache-2.0

export type ResolveOptions = { onWarning?: (message: string) => void };
export type ResolveResult = { text: string; status: "ok" | "unavailable" };

export function resolve(
  _promptId: string,
  _vars?: Record<string, unknown>,
  options?: ResolveOptions
): ResolveResult {
  options?.onWarning?.("not implemented");
  return { text: "", status: "unavailable" };
}
```
No dependencies (rule `sdk-has-no-npm-deps` — Node builtins remain allowed for the future disk cache, npm deps do not).

### `packages/cli` — `@41prompts/cli`
Bin `41p` (unchanged mechanism: `src/bin.ts`, `#!/usr/bin/env tsx`, root's `tsx` devDependency, no build step
needed before `pnpm --filter @41prompts/cli exec 41p --version`). May depend on `@41prompts/core` per the epic —
none needed yet for a version-only stub, so `dependencies: {}` for now.

### Public `package.json` shape — `core`, `sdk-ts`, `cli` (exact fields, per correction 5)
```json
{
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/41prompts/41prompts.git",
    "directory": "packages/<dir>"
  },
  "files": ["dist", "LICENSE", "NOTICE", "README.md"],
  "publishConfig": { "access": "public", "provenance": true },
  "scripts": {
    "prepublishOnly": "test \"$GITHUB_REPOSITORY\" = 41prompts/41prompts"
  }
}
```
No `"private": true` anywhere on these three. `"files"` naming `dist` implies each gets a real `build` script
(`tsc -p tsconfig.json`, emitting) — added even though nothing in EPIC-000 runs it, since the shape is specified
exactly and Turborepo's `build` task already expects a `dist/**` output. `bin` keeps pointing at `src/bin.ts` for
now (the epic's own Notes bless the tsx/no-build path for this epoch); reconciling that with a `dist`-based bin is
EPIC-056's problem, noted in the report, not solved here.

### Private packages (`db`, `ui`) and apps (`web`, `worker`), and the **root** `package.json`
```json
{ "private": true, "license": "UNLICENSED" }
```

### `sdks/python`
```toml
[project]
name = "fortyone-prompts"  # TODO(EPIC-054): confirm this distribution name before first publish
version = "0.0.1"
requires-python = ">=3.12"
license = "Apache-2.0"
license-files = ["LICENSE", "NOTICE"]
dependencies = []

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[dependency-groups]
dev = ["pytest"]
```
`resolve()` mirrors the TS shape, never raises:
```python
# SPDX-FileCopyrightText: 2026 <legal entity>
# SPDX-License-Identifier: Apache-2.0

from typing import Callable, Optional, TypedDict


class ResolveResult(TypedDict):
    text: str
    status: str


def resolve(
    prompt_id: str,
    vars: Optional[dict] = None,
    on_warning: Optional[Callable[[str], None]] = None,
) -> ResolveResult:
    if on_warning is not None:
        on_warning("not implemented")
    return {"text": "", "status": "unavailable"}
```

---

## 5. Boundary enforcement — allow-list, five rules, plus Turborepo tags

Same underlying mechanism as the first plan (`tsconfig.depcruise.json` path-mapping every `@41prompts/*` package
so an *undeclared* import still resolves to a file and gets caught as a boundary violation rather than "module not
found" — pnpm's strict linking would otherwise hide the violation behind a resolution error). What's different:
the rule set is now allow-list, five named rules exactly as the epic lists, which is also what fixes the first
plan's gap (a deny-list naming only `apps/` and `packages/db` never caught an import of `packages/ui`; an allow-list
that says "public may only import public, builtins, or its own deps" catches `ui` for free).

**`.dependency-cruiser.cjs`:**
```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "public-only-imports-public",
      severity: "error",
      comment: "core, cli, and sdk-ts may import only each other, Node builtins, or their own declared deps (CLAUDE.md rule 11).",
      from: { path: "^packages/(core|cli|sdk-ts)/src" },
      to: {
        path: "^(?!packages/(core|cli|sdk-ts)/src)",
        pathNot: "^(node:|npm:)",
        dependencyTypesNot: ["core", "npm", "npm-dev"]
      }
    },
    {
      name: "core-is-pure",
      severity: "error",
      comment: "packages/core is pure TS: no npm dependency, no Node builtin, no IO (CLAUDE.md rule 1 / ADR-001).",
      from: { path: "^packages/core/src", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm", "npm-dev", "core"] }
    },
    {
      name: "sdk-has-no-npm-deps",
      severity: "error",
      comment: "packages/sdk-ts ships zero npm dependencies; Node builtins stay allowed for the future disk cache.",
      from: { path: "^packages/sdk-ts/src", pathNot: "\\.test\\.ts$" },
      to: { dependencyTypes: ["npm", "npm-dev"] }
    },
    {
      name: "no-phantom-deps",
      severity: "error",
      comment: "a public package importing something not in its own declared dependencies is a phantom dependency.",
      from: { path: "^packages/(core|cli|sdk-ts)/src" },
      to: { dependencyTypes: ["npm-no-pkg", "npm-unknown"] }
    },
    {
      name: "layering-core-sdk-never-import-cli-core-never-imports-sdk",
      severity: "error",
      comment: "cli may depend on core; core and sdk-ts never import cli; core never imports sdk-ts.",
      from: { path: "^packages/(core|sdk-ts)/src" },
      to: { path: "^packages/cli/src" }
    }
  ],
  options: {
    tsConfig: { fileName: "tsconfig.depcruise.json" },
    doNotFollow: { path: "node_modules" }
  }
};
```
(The fifth rule's `core never imports sdk-ts` half is covered by the same `from` glob; a sixth micro-rule isn't
needed since both directions collapse into "core/sdk-ts → cli is forbidden" plus rule 1 already forbids
`core → sdk-ts` as a cross-package-not-builtin-not-own-dep import.)

Root script: `"boundaries": "depcruise --config .dependency-cruiser.cjs packages/core/src packages/cli/src packages/sdk-ts/src"`.

**Turborepo boundary tags.** `packages/core/turbo.json`, `packages/sdk-ts/turbo.json`, `packages/cli/turbo.json`:
```json
{ "tags": ["public"] }
```
Root `turbo.json` gains:
```json
"boundaries": {
  "tags": {
    "public": { "dependencies": { "allow": ["public"] } }
  }
}
```
so a public package declaring a workspace dependency on `@41prompts/ui` (untagged → implicitly not `public`) is
refused by `turbo boundaries` itself, independent of what dependency-cruiser catches (dependency-cruiser looks at
*imports in source*; `turbo boundaries` looks at *declared `package.json` dependencies* — the acceptance criterion
that adding `"@41prompts/ui": "workspace:*"` to `packages/core/package.json` fails `turbo boundaries` needs exactly
this second, independent check, since nothing would `import` it yet). I'm implementing this against whatever
schema the installed `turbo` version's `boundaries` command actually accepts (it's a newer/experimental Turborepo
feature) — verifying with `turbo boundaries --help` and a real run during implementation, and adjusting field names
here if the installed version differs from the shape above.

Root script becomes: `"lint": "turbo run lint && pnpm boundaries && turbo boundaries"`.

**Expected failures, each reverted after evidence is captured:**
- `import "@41prompts/db"` in `packages/core/src/index.ts` → `pnpm boundaries` fails naming `public-only-imports-public`.
- `import "node:fs"` in `packages/core/src/index.ts` → fails naming `core-is-pure`.
- `"@41prompts/ui": "workspace:*"` added to `packages/core/package.json` → `turbo boundaries` fails (no source import needed).

---

## Everything else

Turborepo pipeline (`test`/`typecheck`/`lint` uncached-output-but-still-cache-hit design), the CI workflow, the
CLI's build-free `tsx` execution, `apps/web`/`apps/worker`/`packages/db`/`packages/ui` shape, and the "won't build"
list (real DB schema, `infra/`, decompiler/compiler logic, `packages/engine`, a CLI argument parser, design tokens
content) are unchanged from the first plan and are not repeated here.
