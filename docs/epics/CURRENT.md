# EPIC-000: Repo scaffold
Stage: 0 · Depends on: — · Size: M · Revised 2026-09-04 after the specialist review

## Goal
A monorepo exists in which `pnpm install && pnpm test && pnpm typecheck && pnpm lint` all pass, with the package
boundaries from ADR-001 enforced as an allow-list, Apache-2.0 and SPDX headers on the public packages, and CI green,
so every later epic starts from a green build.

## Scope
- pnpm workspaces + Turborepo. Node 22 pinned via `.nvmrc` and `engines`. `.editorconfig`, Prettier, single ESLint flat config.
- Packages, each with `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, and one passing test:
  - `packages/core` — `@41prompts/core`. Pure TS. `"lib": ["ES2022"]`, no DOM. Zero dependencies. `sideEffects: false`.
  - `packages/sdk-ts` — **`@41prompts/sdk`**. Zero npm dependencies. Exports `resolve()` that **does not throw**: it returns `{ text: "", status: "unavailable" }` and calls `options.onWarning?.("not implemented")`. Rule 8 applies from day one.
  - `packages/cli` — `@41prompts/cli`. bin `41p` printing `0.0.1`. May depend on `@41prompts/core`.
  - `packages/db` — `@41prompts/db`. Drizzle + `pg`. Empty schema. `drizzle.config.ts`. Private.
  - `packages/ui` — `@41prompts/ui`. Empty `src/tokens.css`, one placeholder component. Private.
  - `apps/web` — Next.js 16 App Router, Tailwind v4 CSS-first, one page rendering "41Prompts". Private.
  - `apps/worker` — Node entry logging "worker up". Private.
  - `sdks/python` — `fortyone-prompts`, import `fortyone`, `resolve()` stub that does not raise, one pytest. `dependencies = []`, `requires-python >= 3.12`, `license = "Apache-2.0"`, `license-files = ["LICENSE", "NOTICE"]`.
- Public package.json shape (`core`, `sdk-ts`, `cli`):
  `"license": "Apache-2.0"`, `"repository": { "type": "git", "url": "git+https://github.com/41prompts/41prompts.git", "directory": "<path>" }`, `"files": ["dist", "LICENSE", "NOTICE", "README.md"]`, `"publishConfig": { "access": "public", "provenance": true }`, `"scripts": { "prepublishOnly": "test \"$GITHUB_REPOSITORY\" = 41prompts/41prompts" }`. **No `private: true`** on public packages.
- Private packages and root: `"private": true, "license": "UNLICENSED"`.
- `LICENSE` (Apache-2.0 verbatim) and `NOTICE` in each public package and in `sdks/python`. NOTICE text:
  ```
  41Prompts
  Copyright 2026 <legal entity>

  This product includes software developed at 41Prompts (https://41prompts.ai).
  ```
- SPDX header as the first two lines of every `.ts`, `.tsx`, `.py`, `.pyi` under the four public paths:
  `// SPDX-FileCopyrightText: 2026 <legal entity>` / `// SPDX-License-Identifier: Apache-2.0` (Python: `#`).
- Root `LICENSES/Apache-2.0.txt` and `LICENSES/LicenseRef-41Prompts-Proprietary.txt` (text in ADR-002 / licensing review).
- Boundary enforcement with dependency-cruiser, **allow-list form**, using a `tsconfig.depcruise.json` that path-maps every `@41prompts/*` so undeclared imports resolve and are caught as boundary errors rather than "not found". Rules:
  1. `public-only-imports-public`: from `packages/(core|cli|sdk-ts)` to anything not in those paths, node builtins, or `node_modules` → error.
  2. `core-is-pure`: from `packages/core/src` (excluding tests) to any npm dependency or node builtin → error.
  3. `sdk-has-no-npm-deps`: from `packages/sdk-ts/src` (excluding tests) to any npm dependency → error (builtins allowed for the disk cache).
  4. `no-phantom-deps`: from public packages to `npm-no-pkg` / `npm-unknown` → error.
  5. Layering: `core` and `sdk-ts` never import `cli`; `core` never imports `sdk-ts`.
- Turborepo boundary tags: `core`, `cli`, `sdk-ts` tagged `public` (may depend only on `public`); everything else `private`.
- Turborepo pipeline for `test`, `typecheck`, `lint`; caching verified.
- GitHub Actions `ci.yml`: install, lint (eslint + depcruise + turbo boundaries), typecheck, test, Python test. pnpm cache.
- `.github/PULL_REQUEST_TEMPLATE.md` with the Definition of Done.
- Root `README.md`: one paragraph and the commands.
- `docs/` already lives here; no copy step.

## Out of scope
- Any real schema, auth, UI, tokens content. (EPIC-002, EPIC-003)
- Docker, Coolify, deployment. (EPIC-001)
- REUSE.toml, SBOM, licence gate, mirror dry-run. (EPIC-007)
- Any decompiler or compiler logic. (Stage 1–2)
- `packages/engine`. Not until an epic needs it.
- Namespace registration. (EPIC-006)

## Acceptance criteria
- [ ] Fresh clone: `pnpm install && pnpm test && pnpm typecheck && pnpm lint` exit 0. Evidence: output tail.
- [ ] `pnpm --filter @41prompts/core test` runs one test and passes.
- [ ] `cd sdks/python && uv run pytest -q` passes one test; `uv run python -c "import fortyone; print(fortyone.resolve('pr_x', {}))"` prints without raising.
- [ ] Adding `import "@41prompts/db"` to `packages/core/src/index.ts` makes `pnpm lint` fail naming rule `public-only-imports-public`. Evidence: the error line. Revert.
- [ ] Adding `import "node:fs"` to `packages/core/src/index.ts` fails with `core-is-pure`. Revert.
- [ ] Adding `"@41prompts/ui": "workspace:*"` to `packages/core/package.json` fails `turbo boundaries`. Revert.
- [ ] `pnpm dev` starts web on :3000 showing "41Prompts" and the worker logs "worker up".
- [ ] `pnpm --filter @41prompts/cli exec 41p --version` prints `0.0.1`.
- [ ] Every file under the four public paths has the SPDX header (`grep -L "SPDX-License-Identifier" …` returns nothing).
- [ ] `LICENSE` and `NOTICE` present in `packages/core`, `packages/sdk-ts`, `packages/cli`, `sdks/python`.
- [ ] Second `pnpm test` reports Turborepo cache hits.
- [ ] CI workflow valid (pushed run or `act` dry run).
- [ ] `docs/epics/reports/EPIC-000-report.md` and `docs/epics/sessions/EPIC-000-session.md` written.

## Verification
```
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @41prompts/cli exec 41p --version        # 0.0.1
cd sdks/python && uv run pytest -q                     # 1 passed
grep -rL "SPDX-License-Identifier" packages/core/src packages/sdk-ts/src packages/cli/src sdks/python/fortyone   # empty
```

## Notes for the implementer
- The directory stays `packages/sdk-ts`; only the package name is `@41prompts/sdk`.
- `tsx` as a root dev dependency to run the CLI and worker without a build step is fine; say so in the PR.
- Do not add shadcn. Do not add a CLI argument parser.
- `<legal entity>` is a literal placeholder; do not invent a company name.
- Keep every package a stub. Green and empty beats half-built.
