# EPIC-000: Repo scaffold
Stage: 0 · Depends on: — · Size: M

## Goal
A monorepo exists in which `pnpm install && pnpm test && pnpm typecheck && pnpm lint` all pass, with the package boundaries from ADR-001 in place and CI enforcing them, so every later epic starts from a green build.

## Scope
- pnpm workspaces + Turborepo. Node 22 pinned via `.nvmrc` and `engines`.
- Packages, each with `package.json`, `tsconfig.json`, `src/index.ts`, and one passing test:
  - `packages/core` (pure TS; `sideEffects: false`; no runtime deps)
  - `packages/db` (Drizzle + `pg`; empty schema file; `drizzle.config.ts`)
  - `packages/ui` (empty tokens file `src/tokens.css` and one placeholder component)
  - `packages/cli` (bin `41p` that prints version)
  - `packages/sdk-ts` (exports a `resolve` stub that throws `NotImplemented`)
  - `apps/web` (Next.js 16, App Router, Tailwind v4, one page rendering "41Prompts")
  - `apps/worker` (Node entry that logs "worker up" and exits)
  - `sdks/python` (pyproject, `fortyone/__init__.py` with `resolve` stub, one pytest)
- Shared configs: `tsconfig.base.json` strict, ESLint flat config, Prettier, `.editorconfig`.
- Vitest configured per package; root `pnpm test` runs all via Turborepo.
- Boundary enforcement: an ESLint rule (or `dependency-cruiser`) that fails if `packages/core`, `packages/cli`, `packages/sdk-ts` import from `apps/*` or `packages/db`.
- GitHub Actions: `ci.yml` on push and PR running install, lint, typecheck, test, and the Python test. Cache pnpm store.
- `.github/PULL_REQUEST_TEMPLATE.md` with the Definition of Done checklist from CLAUDE.md.
- `docs/` copied in as provided: `CLAUDE.md` at root, `docs/PROCESS.md`, `docs/backlog.md`, `docs/decisions/*`, `docs/epics/*`, `docs/design/*` (the HTML mockups).
- Root `README.md`: one paragraph and the commands.
- Per-package `LICENSE`: MIT in `core`, `cli`, `sdk-ts`, `sdks/python`; none elsewhere (ADR-002).

## Out of scope
- Any real database schema, auth, or UI. (EPIC-002, EPIC-003)
- Docker, Coolify, deployment. (EPIC-001)
- Any decompiler or compiler logic. (Stage 1–2)
- Design tokens content. (EPIC-003)

## Acceptance criteria
- [ ] Fresh clone on a clean machine: `pnpm install && pnpm test && pnpm typecheck && pnpm lint` exit 0. Evidence: paste the output tail.
- [ ] `pnpm --filter @41prompts/core test` runs at least one test and passes.
- [ ] `cd sdks/python && uv run pytest` (or `pytest` in a venv) passes one test.
- [ ] Adding `import "@41prompts/db"` to `packages/core/src/index.ts` makes `pnpm lint` fail with a boundary error. Evidence: the error line. Revert after.
- [ ] `pnpm dev` starts `apps/web` on :3000 showing "41Prompts" and the worker logs "worker up".
- [ ] CI workflow file exists and is syntactically valid (`act` dry run or a pushed run; either is evidence).
- [ ] `npx 41p --version` (via `pnpm --filter @41prompts/cli exec`) prints `0.0.1`.
- [ ] Turborepo pipeline caches: second `pnpm test` run reports cache hits.
- [ ] `docs/epics/reports/EPIC-000-report.md` written per CLAUDE.md.

## Verification
```
pnpm install
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @41prompts/cli exec 41p --version   # 0.0.1
cd sdks/python && uv run pytest -q                # 1 passed
```

## Notes for the implementer
- Package names are scoped `@41prompts/*`. Python package name is `fortyone` (import) and `41prompts` is not a valid identifier; distribution name on PyPI will be `fortyone-prompts`, decided in EPIC-054, leave a TODO.
- Use Tailwind v4's CSS-first config (`@import "tailwindcss"` + `@theme`); do not create a `tailwind.config.js`.
- Keep `packages/core` `tsconfig` with `"lib": ["ES2022"]` and **no** DOM lib, so any accidental browser API use fails typecheck.
- Do not add shadcn yet.
- Do not write more than a stub in any package. Green and empty beats half-built.
