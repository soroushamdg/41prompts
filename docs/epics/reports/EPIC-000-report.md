# EPIC-000 report: Repo scaffold

Branch `epic/000-repo-scaffold`. 2026-09-03.

## Built

A pnpm + Turborepo monorepo, Node 22 pinned, with every package/app from the epic's Scope as a green stub:

- **`packages/core`** — `@41prompts/core`, Apache-2.0. Pure TS, `"lib": ["ES2022"]` (no DOM), zero runtime deps, `sideEffects: false`.
- **`packages/sdk-ts`** — published name **`@41prompts/sdk`** (directory unchanged), Apache-2.0. `resolve()` never throws: returns `{ text: "", status: "unavailable" }` and calls `options.onWarning?.("not implemented")`.
- **`packages/cli`** — `@41prompts/cli`, Apache-2.0. `41p --version` prints `0.0.1` via a `tsx`-shebang `src/bin.ts`, no build step.
- **`packages/db`** — `@41prompts/db`, private/UNLICENSED. Drizzle + `pg`, `schema.ts` intentionally empty, `drizzle.config.ts`.
- **`packages/ui`** — `@41prompts/ui`, private/UNLICENSED. Empty `tokens.css`, one placeholder component.
- **`apps/web`** — Next.js 16 App Router, Tailwind v4 CSS-first (`@tailwindcss/postcss`, no `tailwind.config.js`), one page rendering "41Prompts".
- **`apps/worker`** — logs `"worker up"` and exits.
- **`sdks/python`** — `fortyone-prompts` (dist name), import `fortyone`, Apache-2.0. `resolve()` never raises; `dependencies = []`; `requires-python >= 3.12`; `license = "Apache-2.0"`; `license-files = ["LICENSE", "NOTICE"]`.

**Licensing (ADR-002).** `LICENSE` (verbatim Apache-2.0) + `NOTICE` in all four public paths; SPDX header (<!-- REUSE-IgnoreStart -->`SPDX-FileCopyrightText` / `SPDX-License-Identifier: Apache-2.0`<!-- REUSE-IgnoreEnd -->) on every source file under them; root `LICENSES/Apache-2.0.txt` and `LICENSES/LicenseRef-41Prompts-Proprietary.txt`. Public `package.json`s carry the exact shape from the epic (`license`, `repository.directory`, `files`, `publishConfig.provenance`, `prepublishOnly` guard, no `private`); private packages and root are `private: true, license: "UNLICENSED"`.

**Boundary enforcement**, allow-list, five dependency-cruiser rules exactly as named in the epic (`public-only-imports-public`, `core-is-pure`, `sdk-has-no-npm-deps`, `no-phantom-deps`, `layering-core-sdk-never-import-cli`), resolved through `tsconfig.depcruise.json` (a path map used only by `depcruise`, so an undeclared cross-package import still resolves to a file and is caught as a boundary error rather than "module not found" under pnpm's strict linking). Plus Turborepo boundary tags (`public`/`private` in each public package's own `turbo.json` and root `turbo.json`'s `boundaries.tags`), which catches a *declared* workspace dependency even with no matching `import`. Both run inside `pnpm lint`.

**CI**: `.github/workflows/ci.yml` — checkout, pnpm setup, node setup (pnpm-cached), install, lint, typecheck, test, then Python setup + `uv` + `pytest`. `.github/PULL_REQUEST_TEMPLATE.md` carries the Definition of Done checklist.

## Skipped (Out of scope, per the epic)

Real DB schema/auth/UI, Docker/Coolify, `REUSE.toml`/SBOM/licence gate/mirror dry-run (EPIC-007), decompiler/compiler logic, `packages/engine`, namespace registration, a CLI argument parser, design tokens content.

## Deliberate choices worth flagging

1. **`LICENSES/LicenseRef-41Prompts-Proprietary.txt` text isn't sourced from anywhere.** The epic's Scope says its "text in ADR-002 / licensing review" — neither document actually contains proprietary licence body text, only the SPDX identifier name. I wrote generic "all rights reserved / proprietary" boilerplate (`<legal entity>` kept literal, no legal claims invented). Not a `BLOCKER`: `LICENSES/` isn't in Acceptance criteria, and `REUSE.toml` (the only place this identifier gets consumed) is explicitly Stage EPIC-007. **Needs real legal wording before EPIC-007.**
2. **`packages/cli/src/bin.ts`'s shebang is line 1, SPDX is lines 2–3, not "the first two lines."** Unavoidable: the OS/interpreter requires `#!` at byte 0 for the file to execute as `41p`, and the CLI-prints-`0.0.1` acceptance criterion is checked, unlike line position (the epic's own grep check only tests that the string appears somewhere in the file). Every other file under the four public paths has it on lines 1–2.
3. **The root `package.json` declares `"@41prompts/cli": "workspace:*"` in its own `devDependencies`.** pnpm does not link a package's own `bin` into its own `node_modules/.bin`, so without a workspace dependency on it from *somewhere*, `41p` has nothing to `exec` before a real build exists. Declaring it at the root (rather than as a self-referential dependency inside `packages/cli/package.json`, tried first and replaced) links `41p` into the workspace root's `node_modules/.bin` instead, so `pnpm exec 41p --version` works from the repo root with no `--filter` and no Turborepo self-dependency warning.
4. **`tsconfig.base.json` sets `"types": []`.** Without it, `tsc`'s default typeRoots scan climbs every ancestor directory looking for `node_modules/@types` — including, in this sandbox, `/Users/soro/node_modules/@types` from an unrelated global install — and pulled in a broken `react` ambient type into every package's typecheck, `apps/web` included. `"types": []` disables that automatic global-ambient inclusion; it does not affect normal `import`-driven type resolution (drizzle/pg, Next's own `next-env.d.ts` triple-slash references, etc. are unaffected).
5. **Every package that imports from `vitest` in a `.test.ts(x)` file now declares `vitest` in its own `devDependencies`**, not just the root. Root-only worked for *running* `vitest`/`tsc`/`eslint` as CLI binaries (pnpm's bin-PATH walks up to the workspace root), but not for *resolving the `import "vitest"` specifier* inside source under pnpm's strict linking — dependency-cruiser correctly flagged that as `no-phantom-deps` the first time I ran it. Fixed everywhere, not only in the three packages the boundary check scans.
6. **`apps/web/next-env.d.ts` is committed with the static two-line form**, not the version Next.js regenerates the moment you run `next dev` (which adds `import "./.next/dev/types/routes.d.ts"` etc.). The regenerated form breaks a fresh-clone `pnpm typecheck` before `.next/` exists. This file will keep drifting locally every time someone runs `next dev`; that's expected Next.js behaviour and fine to leave uncommitted.

## Open questions

- Same conflict flagged in the plan (now resolved per your instruction, recorded here for the trail): `packages/sdk-ts`'s stub does not throw, per correction 4 / CLAUDE.md rule 8.
- Item 1 above: real proprietary licence wording needed before EPIC-007.
- `eslint@9.39.5` is pinned deliberately (its own project marks 9.x "maintenance," 10.x is current) for ecosystem stability with `@typescript-eslint@8.x`; likewise `typescript@5.9.3` over the newly-released `7.0.2`, and `vitest@3.2.7` over `5.0.0`. Worth a deliberate upgrade epic once the rest of the toolchain (Next, `@typescript-eslint`) has caught up to those majors, rather than by default in EPIC-000.
- CI workflow's YAML was validated for syntax (`python3 -c "import yaml; yaml.safe_load(...)"`) and each step mirrors an exact, separately-verified local command; no pushed run or `act` dry run happened in this session (no GitHub remote, `act` not installed). First push will be the real evidence.

## Verification (run in this session, all green)

```
$ pnpm install
Lockfile is up to date, resolution step is skipped
Already up to date
Done in 1.2s using pnpm v10.25.0

$ pnpm lint && pnpm typecheck && pnpm test
...
> pnpm boundaries
✔ no dependency violations found (9 modules, 8 dependencies cruised)
> turbo boundaries
Checking packages...
Checked 31 files in 7 packages, no issues found
...
 Tasks:    7 successful, 7 total   (lint)
 Tasks:    7 successful, 7 total   (typecheck)
 Tasks:    7 successful, 7 total, 7 cached >>> FULL TURBO   (test, cache hit)

$ pnpm exec 41p --version
0.0.1

$ cd sdks/python && uv run pytest -q
2 passed in 0.00s

$ uv run python -c "import fortyone; print(fortyone.resolve('pr_x', {}))"
{'text': '', 'status': 'unavailable'}

$ grep -rL "SPDX-License-Identifier" packages/core/src packages/sdk-ts/src packages/cli/src sdks/python/fortyone
(no output — every file has the header; exit code 1)
```

Negative cases (each triggered, evidence captured, then reverted — see the plan §5 for the mechanism):

```
# import "@41prompts/db"; added to packages/core/src/index.ts
error public-only-imports-public: packages/core/src/index.ts → packages/db/src/index.ts

# import "node:fs"; added to packages/core/src/index.ts
error core-is-pure: packages/core/src/index.ts → fs

# "@41prompts/ui": "workspace:*" added to packages/core/package.json dependencies
x Package `@41prompts/ui` found without any tag listed in allowlist for `@41prompts/core`
Checked 31 files in 7 packages, 1 issue found
```

`pnpm dev`: worker logged `worker up` and exited; `curl localhost:3000` returned `<main class="p-8 text-2xl font-semibold">41Prompts</main>`. Both processes stopped after the check.

## Acceptance criteria — checked off

- [x] Fresh install/test/typecheck/lint exit 0 — tail above.
- [x] `pnpm --filter @41prompts/core test` runs one test, passes.
- [x] `uv run pytest -q` passes (2 tests — resolve shape + onWarning, both required by correction 4); `uv run python -c "..."` prints without raising.
- [x] `import "@41prompts/db"` fails naming `public-only-imports-public`. Reverted.
- [x] `import "node:fs"` fails naming `core-is-pure`. Reverted.
- [x] `"@41prompts/ui": "workspace:*"` fails `turbo boundaries`. Reverted.
- [x] `pnpm dev`: web on :3000 shows "41Prompts"; worker logs "worker up".
- [x] `pnpm exec 41p --version` prints `0.0.1` (root `devDependencies` link, no `--filter` needed).
- [x] SPDX grep empty.
- [x] LICENSE + NOTICE present in all four public paths.
- [x] Second `pnpm test` run: `7 cached, 7 total >>> FULL TURBO`.
- [x] CI workflow present, YAML-valid; not yet pushed (see Open questions).
- [x] This report and `docs/epics/sessions/EPIC-000-session.md` written.
