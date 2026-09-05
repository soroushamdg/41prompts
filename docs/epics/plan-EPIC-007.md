# Plan: EPIC-007 Compliance CI

Read: `docs/epics/EPIC-007-compliance-ci.md` (= `CURRENT.md`), `docs/decisions/ADR-002-licensing-
and-repos.md`, `.dependency-cruiser.cjs`, `turbo.json`, `scripts/forbidden-words.mjs`.

## What already exists (from EPIC-000/003/004), verified rather than assumed

- `.dependency-cruiser.cjs` already has the public-package allow-list rule (`public-only-imports-
  public`, `core-is-pure`, `sdk-has-no-npm-deps`, `no-phantom-deps`), wired into `pnpm boundaries`.
- Every public package's own `turbo.json` already carries `"tags": ["public"]`, and root
  `turbo.json` already has a `boundaries.tags.public.dependencies.allow: ["public"]` rule, wired
  into `pnpm lint` as `turbo boundaries` — decision 2's "Turborepo boundary tags" is not new work.
- `scripts/forbidden-words.mjs` already exists and is wired into `pnpm lint` with exactly decision
  6's word list.
- Every public package's `src/` already carries real
  <!-- REUSE-IgnoreStart -->`SPDX-FileCopyrightText`/`SPDX-License-Identifier: Apache-2.0`<!-- REUSE-IgnoreEnd -->
  headers (confirmed by reading a sample from all four:
  `core`, `cli`, `sdk-ts`, `sdks/python`'s `fortyone`/`tests`). `LICENSES/Apache-2.0.txt` and
  `LICENSES/LicenseRef-41Prompts-Proprietary.txt` already exist at root.
- None of the above needs new code. The real new work is REUSE (no `REUSE.toml` exists yet — a
  first `reuse lint` run found 232 of 248 tracked files with no licensing info at all, all outside
  the four public packages), SBOM + the licence gate, the mirror dry-run, `CONTRIBUTING.md`, the
  `compliance.yml` workflow, and `pnpm compliance`.

## Decisions made while spiking each piece (before committing to this plan)

- **REUSE via `REUSE.toml` bulk annotations, not per-file headers, for everything outside the four
  public packages.** Matches the established convention from EPIC-003's report ("packages/ui gets
  no SPDX header comment at all, matching packages/db's existing convention — proprietary packages
  carry none"). Two annotation blocks: one assigning `LicenseRef-41Prompts-Proprietary` to
  `apps/**`, `docs/**`, `infra/**`, `packages/{db,ui,logger}/**`, `scripts/**`, `.github/**`, and
  named root config files; one assigning `Apache-2.0` to the four public packages' own *non-source*
  files (`package.json`, `README.md`, `NOTICE`, `tsconfig.json`, `turbo.json`, `pyproject.toml`,
  `uv.lock`) — these ship as part of the same public artifact as `src/`, which already carries a
  real header, so they get the same licence, not the repo-wide proprietary default. Result: 0
  exclusions, 248/248 (later 252/252) files with real copyright+licence, verified with a real
  `reuse lint` run before writing any of the rest.
- **Several genuine false positives, not real gaps**: `docs/epics/reports/EPIC-000-report.md`,
  `docs/epics/sessions/EPIC-003-session.md`, `CONTRIBUTING.md`, and this plan itself all mention
  the literal SPDX tag syntax in prose describing past work or this epic's own approach, which
  REUSE's text scanner tries to parse as a real tag. Wrapped each mention in
  <!-- REUSE-IgnoreStart -->`REUSE-IgnoreStart`/`REUSE-IgnoreEnd`<!-- REUSE-IgnoreEnd --> comments
  — the tool's own sanctioned mechanism for exactly this, not an exclusion of the file from real
  analysis (everything around those lines is still checked).
- **License gate and SBOM built from `pnpm licenses list --json`, not `@cyclonedx/cyclonedx-npm`.**
  Tried `cyclonedx-npm` first (the obvious off-the-shelf tool); it shells out to `npm ls` internally
  and fails outright on a pnpm-managed `node_modules` (confirmed by actually running it — dozens of
  `npm error missing: ...` lines from peer/dev deps `npm ls` can't see in pnpm's non-flat layout).
  `pnpm licenses list --json` already groups every resolved dependency by licence with name/version/
  author; `scripts/license-gate.mjs` reshapes that into a hand-written CycloneDX 1.5 document and
  the licence-allow-list check in one pass, no extra dependency.
- **Public-package licence gate scoped to `--filter <pkg> --prod` per public package**; the same
  finding anywhere else in the workspace is a warning printed to the same run, not a second command
  a reader has to know to also check. All four public packages currently ship zero runtime
  dependencies, so the strict gate is trivially clean today — this session still verified the logic
  fails correctly (see the deliberate-failure exercise below) rather than trusting an untested
  no-op path.
- **Mirror dry-run needs no `.public-root/` override layer.** ADR-002 mentions one for the *real*
  split (EPIC-056); tested empirically whether this dry run needs it too — it doesn't. After
  `git filter-repo` keeps only the four public package directories plus the shared root config
  they reference (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.dependency-
  cruiser.cjs`, `eslint.config.js`, `turbo.json`, …), `pnpm-workspace.yaml`'s existing glob
  (`packages/*`) simply resolves to only the three remaining directories on disk, and nothing in
  the kept root files references a now-missing private package by `workspace:*`. Confirmed with a
  real run: fresh clone → `git filter-repo` → `pnpm install --no-frozen-lockfile` → `pnpm test` →
  `uv run pytest` (sdks/python), all green, before writing this into a script.
- **`uvx git-filter-repo` and `uvx reuse`, not a system install**, so the exact same command runs
  locally and in CI (already the pattern `ci.yml` uses for `sdks/python`'s own tests via
  `astral-sh/setup-uv`).

## Build order

1. `REUSE.toml` — write, then iterate against real `reuse lint` output until 0 exclusions.
2. `scripts/license-gate.mjs` — licence gate + SBOM emission, tested against the real lockfile.
3. `scripts/mirror-dry-run.sh` — tested standalone before wiring into anything else.
4. `package.json`: `reuse-lint`, `license-gate`, `mirror-dry-run`, `compliance` scripts. Tested
   `pnpm compliance` end to end locally (must exit 0 before moving on).
5. `.github/workflows/compliance.yml`: `reuse` (fsfe/reuse-action), `boundaries-and-forbidden-
   words`, `license-gate` (+ SBOM artifact upload), `mirror-dry-run` (needs `fetch-depth: 0` — its
   own script does a *second* clone from this checkout and filters *that*, so a shallow checkout
   here would silently truncate what the dry run is supposed to prove survives) — four parallel
   jobs, not one serial job, per decision 7's speed note. A fifth job, `attach-sbom-to-release`,
   gated `if: github.ref_type == 'tag'`, attaches the same SBOM artifact to a GitHub Release.
6. `CONTRIBUTING.md`.
7. The five deliberate-failure criteria (see below) — one commit each on a scratch branch that
   never merges, evidence captured, then discarded entirely (not reverted-and-kept — the epic's own
   instructions say "revert," and a scratch branch nobody merges needs no revert commit either,
   just deletion, since main never sees it).

## The five deliberate-failure criteria

Per the epic's "Notes for the implementer": one commit that breaks it, one CI run (or the local
`pnpm compliance` equivalent) as evidence, on a scratch branch, never merged.

1. Import `packages/db` from `packages/core` → `pnpm boundaries` fails with `public-only-imports-
   public` in the message.
2. Add a real npm dependency to `packages/sdk-ts` → `pnpm boundaries` fails with `sdk-has-no-npm-
   deps`.
3. Remove the SPDX header from a public source file → `pnpm reuse-lint` fails.
4. Add a copyleft dependency (e.g. `left-pad`-style GPL package, or simpler: a package whose
   declared licence is GPL) to a public package → `node scripts/license-gate.mjs` exits 1.
5. Introduce the literal word "block" into a UI string → `pnpm forbidden-words` fails.

## Deferred / explicitly out of scope (per the epic's own "Out of scope")

Publishing to npm/PyPI, the actual public repository split, trademark/entity/IP assignment,
dependency vulnerability scanning (EPIC-901). `.grant.yaml`/`.public-root/` as named in
`docs/backlog.md`'s older summary line are not in the epic file's own Scope section — the epic
file wins per `docs/design/README.md`'s own stated precedence rule for exactly this kind of
drift, so neither is built here.
