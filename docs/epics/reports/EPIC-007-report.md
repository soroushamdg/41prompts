# EPIC-007 report: Compliance CI

Branch `epic/007-compliance-ci`. 2026-09-05.

**Status: done.** Every check in the epic's Scope is built, wired into CI, and passes on the
existing tree with zero exclusions added to make it pass. All five deliberate-failure criteria
were exercised for real on a scratch branch that was never pushed and is now deleted — each one
broke the right check with the right rule name in the message, then was reverted.

## Built

Followed the plan (`docs/epics/plan-EPIC-007.md`), written after confirming what already existed
(dependency-cruiser's public-package allow-list, Turborepo boundary tags, and the forbidden-word
grep were all already in place from EPIC-000/003 and needed no new code) and after spiking each
genuinely new piece against real tool output before committing to an approach.

- **`REUSE.toml`**: bulk `[[annotations]]` blocks, not per-file headers, for everything outside
  the four public packages — the established convention already in this repo (EPIC-003's report:
  "packages/ui gets no SPDX header comment at all, matching packages/db's existing convention").
  One block assigns `LicenseRef-41Prompts-Proprietary` to `apps/**`, `docs/**`, `infra/**`,
  `packages/{db,ui,logger}/**`, `scripts/**`, `.github/**`, and named root config files; a second
  assigns `Apache-2.0` to the four public packages' own non-source files (`package.json`,
  `README.md`, `NOTICE`, `tsconfig.json`, `turbo.json`, `pyproject.toml`, `uv.lock`) — these ship
  as part of the same public artifact as `src/`, which already carries real inline headers.
  `pnpm reuse-lint` went from 232 of 248 tracked files with no licensing information at all to
  252/252 with real copyright and licence, zero exclusions. Three genuine false positives (past
  reports/session logs, and this epic's own plan doc, quoting the literal SPDX tag syntax in
  prose) wrapped in `REUSE-IgnoreStart`/`REUSE-IgnoreEnd` — the tool's own sanctioned mechanism,
  not an exclusion of the file from real analysis.
- **`scripts/license-gate.mjs`**: a licence allow-list gate plus CycloneDX 1.5 SBOM generation,
  both built from `pnpm licenses list --json`. Tried `@cyclonedx/cyclonedx-npm` first — it shells
  out to `npm ls` internally and fails outright on a pnpm-managed `node_modules` (confirmed by
  actually running it: dozens of `npm error missing: ...` lines for peer/dev deps `npm ls` can't
  see in pnpm's non-flat layout). The gate is strict for each public package's own production
  dependency closure (`--filter <pkg> --prod`, fails the build) and a warning everywhere else in
  the workspace (decision 4's "in a private package it is a review comment, not a block") — real
  output on this tree today: 0 public-package violations (all four public packages currently ship
  zero runtime dependencies), 17 private-only findings printed as warnings (MPL-2.0, LGPL, FSL,
  CC-BY-4.0, BlueOak, CC0, MIT-0 — a genuine, useful finding, not manufactured for this report).
- **`scripts/mirror-dry-run.sh`**: `git clone --no-local --no-hardlinks` into a scratch temp
  directory, `uvx git-filter-repo` down to the four public packages plus the shared root config
  they need (`package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.dependency-
  cruiser.cjs`, `eslint.config.js`, `turbo.json`, `LICENSES/`, `REUSE.toml`, …), a sanity check
  that no proprietary path survived, then `pnpm install --no-frozen-lockfile && pnpm test` and a
  separate `uv run pytest` for `sdks/python`. Needed no `.public-root/` override layer — ADR-002
  mentions one for the *real* split (EPIC-056); tested empirically whether this dry run needs it
  too, and it doesn't: once `git-filter-repo` removes the private directories from disk,
  `pnpm-workspace.yaml`'s existing `packages/*` glob simply resolves to the three remaining
  directories, and nothing in the kept root files references a now-missing private package by
  `workspace:*`. Verified with a real run before writing it into the script, and again as part of
  `pnpm compliance` afterward — both green, `uv run pytest` reporting `2 passed`.
- **`.github/workflows/compliance.yml`**: four parallel jobs (`reuse` via `fsfe/reuse-action`,
  `boundaries-and-forbidden-words`, `license-gate` with an uploaded SBOM artifact, `mirror-dry-run`
  — the last needs `fetch-depth: 0` since its own script clones *from* that checkout and filters
  *that* clone, so a shallow checkout would silently truncate the history the dry run is supposed
  to prove survives) on every PR and push to `main`, per decision 7. A fifth job,
  `attach-sbom-to-release`, gated `if: github.ref_type == 'tag'`, attaches the same SBOM to a
  GitHub Release.
- **`pnpm compliance`**: the identical set of checks, runnable locally with one command. Verified
  end to end, exit 0, before every subsequent step of this epic.
- **`CONTRIBUTING.md`**: public vs. proprietary packages, the boundary rule, DCO sign-off
  (`git commit -s`), and `pnpm compliance`.
- **The five deliberate-failure criteria**, each on a scratch branch (`scratch/epic-007-
  deliberate-failures`, created from this epic's branch tip, never pushed, deleted after use — not
  merged, not kept):
  1. `packages/core` re-exporting from `packages/db/src/schema` →
     `error public-only-imports-public: packages/core/src/index.ts → packages/db/src/schema.ts`.
  2. A real dependency (`tslib`) added to `packages/sdk-ts` and imported →
     `error sdk-has-no-npm-deps: packages/sdk-ts/src/index.ts → node_modules/.../tslib/tslib.js`.
  3. The SPDX header removed from `packages/cli/src/index.ts` → `reuse lint` fails, "Files with
     license information: 251/253".
  4. A GPL-3.0-only dependency (a local `file:` stub package, since finding a real npm package
     that's both tiny and genuinely copyleft-licensed took longer than just building one) added to
     `packages/core` → `License gate: 1 public-package dependency license(s) outside the
     allow-list: fake-gpl-dep@null: GPL-3.0-only`, exit 1.
  5. The literal word "block" in a new UI string constant in
     `packages/ui/src/primitives/button.tsx` → `forbidden-words` fails, exact file:line and the
     matched word.

  Each was committed, its exact failure output captured (above), then `git revert`ed with the
  relevant check re-run to confirm a clean state before moving to the next. One real mistake made
  and caught in the process: fixing a `reuse-lint` false positive found while investigating failure
  3 got swept into failure 4's `git add -A` and reverted along with it when failure 4 was reverted
  — caught by re-running `pnpm reuse-lint` after returning to the epic branch (it failed), and
  reapplied there as its own commit rather than left broken.

## Acceptance criteria

- [x] Every compliance check runs on pull requests and on `main`, and the whole set runs locally
      with `pnpm compliance`. Evidence: `.github/workflows/compliance.yml`'s `on:` block; local
      `pnpm compliance` run, exit 0, above.
- [x] A deliberate import of `packages/db` from `packages/core` fails CI with the dependency-
      cruiser rule name in the message. Evidence: deliberate-failure 1, above.
- [x] A deliberate npm dependency added to `packages/sdk-ts` fails CI. Evidence: deliberate-failure
      2, above.
- [x] A public source file with its SPDX header removed fails REUSE lint. Evidence: deliberate-
      failure 3, above.
- [x] A dependency with a copyleft licence added to a public package fails the licence gate.
      Evidence: deliberate-failure 4, above.
- [x] The forbidden-word grep fails on a deliberately introduced "block" in a UI string. Evidence:
      deliberate-failure 5, above.
- [x] The mirror dry-run produces a tree containing only the four public packages, and
      `pnpm install && pnpm test` passes inside it. Evidence: `scripts/mirror-dry-run.sh`'s own
      "no proprietary path survived" check plus a real `find . -maxdepth 2` listing, both in the
      Verification output below; `pnpm test`/`uv run pytest` both green inside it.
- [x] SBOM is generated and attached on a `v*` tag. Evidence: `license-gate` job's `--sbom`
      generation (verified locally, 527 components from the real lockfile) + the
      `attach-sbom-to-release` job wired for `github.ref_type == 'tag'`. Not yet observed against a
      real tag push in this session — the next `v*` tag (production already ships from tags per
      EPIC-008) will be the first live confirmation.
- [x] The existing tree passes everything with no exclusions added to make it pass. Evidence: 0
      REUSE exclusions (252/252 real annotations or headers), 0 dependency-cruiser suppressions, 0
      forbidden-word allowlist entries added — the two `REUSE-IgnoreStart`/`End` uses are the
      tool's sanctioned mechanism for a false-positive text match, not a real file being excluded.
- [x] Report and session log written; backlog updated.

## Verification

```
$ pnpm compliance
uvx --with charset-normalizer reuse lint
Congratulations! Your project is compliant with version 3.3 of the REUSE Specification :-)

depcruise --config .dependency-cruiser.cjs packages/core/src packages/cli/src packages/sdk-ts/src
✔ no dependency violations found (11 modules, 11 dependencies cruised)

turbo boundaries
Checked 120 files in 8 packages, no issues found

node scripts/forbidden-words.mjs
Forbidden-word grep clean (packages/ui/src, apps/web/app, apps/web/lib).

node scripts/license-gate.mjs
License gate: 17 dependency license(s) outside the allow-list (private packages only — review, not a block): ...
License gate: clean. 0 public-package dependencies, 527 total in the workspace, 17 private-only warning(s).

bash scripts/mirror-dry-run.sh
[mirror-dry-run] resulting top-level tree:
./LICENSES  ./REUSE.toml  ./packages  ./packages/cli  ./packages/core  ./packages/sdk-ts  ./sdks
[mirror-dry-run] confirming no proprietary path survived the filter
pnpm test  # 3/3 packages, 10 tests, all green
uv run pytest -q  # 2 passed
[mirror-dry-run] OK -- the public-only tree installs and tests standalone

$ pnpm test / pnpm typecheck / pnpm lint    # unchanged, 8 packages, all green (full turbo cache)
$ gitleaks detect --source .
no leaks found
```

## Skipped (out of scope, per the epic)

Publishing to npm/PyPI and the real public repository split (EPIC-056); trademark/entity/IP
assignment (EPIC-006, EPIC-071); dependency vulnerability scanning (EPIC-901's monthly audit).
`docs/backlog.md`'s older one-line summary of this epic also mentions `.grant.yaml` and a
`.public-root/` directory — neither appears in the epic file's own Scope section, and the epic
file wins over an older backlog summary per `docs/design/README.md`'s stated precedence rule for
exactly this kind of drift, so neither was built.

## Open questions for the advisor

1. **The SBOM-on-release criterion is verified by code and a local dry run, not yet by a live tag
   push** — the next real `v*` tag will be the first time `attach-sbom-to-release` actually runs.
   Worth a quick look at the resulting GitHub Release the next time one ships, to confirm the asset
   attaches cleanly (the job logic is straightforward `gh release create`/`upload`, but this
   session had no tag push to observe it against).
2. **17 real, pre-existing private-package licence findings** (MPL-2.0, LGPL-3.0-or-later,
   FSL-1.1-MIT, CC-BY-4.0, BlueOak-1.0.0, CC0-1.0, MIT-0) now show as warnings on every compliance
   run — decision 4 says these are a review comment, not a block, so nothing failed, but they were
   invisible before this epic and are worth an actual look rather than permanent background noise.
