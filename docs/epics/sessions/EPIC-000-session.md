# EPIC-000 session log

**Date.** 2026-09-03.

**Prompt sent.** Re-read CLAUDE.md, ADR-002 (revised), ADR-003 (new), and the revised `docs/epics/CURRENT.md`
after the specialist review changed the epic underneath an already-written plan. Ten numbered corrections given:
Apache-2.0 (not MIT) with `LICENSE`/`NOTICE`/root `LICENSES/`; SPDX headers; `packages/sdk-ts` publishes as
`@41prompts/sdk`; `resolve()` never throws (TS and Python); the exact public `package.json` shape; an allow-list
boundary rule (five named rules, fixing a `packages/ui` gap in the first plan); Turborepo boundary tags folded
into `pnpm lint`; `packages/core` `"lib": ["ES2022"]`, no DOM; Python `dependencies = []` /
`requires-python >= 3.12` / `license = "Apache-2.0"` / `license-files`; `<legal entity>` as a literal placeholder.
Told to update the plan, then implement on `epic/000-repo-scaffold` to the Definition of Done, then report.

**Plan summary.** Revised `docs/epics/plan-EPIC-000.md` in place (superseding the first pass): kept the directory
tree, Turborepo pipeline shape, and CI outline from the original plan; rewrote licensing, SPDX, the public
`package.json` shape, and the boundary-enforcement section for the allow-list/five-rule/Turborepo-tags design.
Flagged one thing the corrections didn't fully specify: the epic's Scope claims `LICENSES/LicenseRef-41Prompts-Proprietary.txt`'s
"text in ADR-002 / licensing review" — neither document actually has proprietary licence body text, only the SPDX
identifier name. Not a `BLOCKER` (not in Acceptance criteria; `REUSE.toml`, the only consumer of that identifier,
is EPIC-007), so I used generic boilerplate and flagged it for real legal wording later.

**Decisions made and why.**
- Committed the advisor's already-present-but-uncommitted doc revisions (CLAUDE.md, both ADRs, ADR-003, backlog,
  roadmap, the review write-up, `docs/weekly/TEMPLATE.md`, the empty-dir placeholders) as the branch's first commit,
  separate from the plan revision and the scaffold itself, since they were sitting unstaged in the working tree
  when this session started and represent a distinct, already-finished piece of work.
- Boundary enforcement: kept the `tsconfig.depcruise.json` path-map mechanism from the first plan (the correction
  explicitly confirmed it), rewrote the rule set to allow-list form. Used `dependencyTypes` (not path regex) to
  distinguish "Node builtin" / "real npm dependency" from "same-repo file" for the purity rules, and plain path
  regex for the cross-package boundary and layering rules, to avoid depending on dependency-cruiser's more
  ambiguous "aliased vs local" classification for tsconfig-paths-resolved specifiers.
- Turborepo `boundaries`: implemented against the installed `turbo@2.10.12`'s actual schema (`tags` in each
  public package's own `turbo.json` with `"extends": ["//"]`, root `turbo.json`'s `boundaries.tags.public.dependencies.allow`)
  since this is a newer/experimental feature I wasn't fully certain of from memory — verified empirically by
  running it and reading its real error output rather than trusting the first draft.
- `packages/sdk-ts`'s `resolve()` and the Python `resolve()`: implemented exactly as correction 4 specifies
  (return a value, call `onWarning`), resolving the conflict the first plan had flagged, in CLAUDE.md rule 8's
  favour, per the instruction.
- Added `vitest` as an explicit `devDependency` in every package that imports from it in a test file (not just
  root), after `dependency-cruiser`'s `no-phantom-deps` rule correctly caught that root-only declaration lets
  `import "vitest"` resolve via pnpm's ancestor-directory walk without the importing package actually declaring it.
- `packages/cli` declares itself as a `workspace:*` devDependency so its own `bin` is locally `pnpm exec`-able
  with no build step, matching the epic's literal Verification command.

**What took longer than expected.**
- `tsc`'s implicit type-roots behaviour: every package's typecheck failed with `Cannot find type definition file
  for 'react'`, including packages with nothing to do with React. Traced it to `tsc`'s default ancestor-directory
  scan for `node_modules/@types`, which climbed past the repo root into this sandbox's `/Users/soro/node_modules/@types`
  (an unrelated global install) and tried to inject a broken `react` ambient type into every program. Fixed with
  `"types": []` in the shared base tsconfig.
- The dependency-cruiser phantom-dependency finding above, and the pnpm self-bin-linking gap for the CLI, were
  both real gaps in the first plan's "share tooling at root only" reasoning — that reasoning holds for *running a
  bin as a script*, not for *resolving an `import` specifier* or *exec-ing a package's own bin*, which are
  different resolution paths. Neither was obvious until dependency-cruiser and `pnpm exec` actually failed.

**Verification output (tail).** See `docs/epics/reports/EPIC-000-report.md`'s Verification section for the full
transcript; short form: `pnpm lint && pnpm typecheck && pnpm test` — `7 successful, 7 total` on every task, second
`pnpm test` run `7 cached, 7 total >>> FULL TURBO`; `41p --version` → `0.0.1`; `uv run pytest -q` → `2 passed`;
SPDX grep → empty.

**Open questions.**
- Real wording for `LICENSES/LicenseRef-41Prompts-Proprietary.txt` before EPIC-007 wires up `REUSE.toml`.
- No pushed CI run or `act` dry run happened (no GitHub remote configured in this session, `act` not installed);
  YAML syntax was validated and every step mirrors a separately-verified local command, but the "pushed run"
  half of that acceptance criterion's evidence is still open until this branch's first push.
- `packages/cli`'s self-dependency prints a benign `Turborepo WARNING Package "@41prompts/cli" depends on itself`
  on every run; worth revisiting once `packages/cli` gains a real dependency on `@41prompts/core`.
