# EPIC-007 session log

**Date.** 2026-09-05.

**Prompt sent.** Same autonomy as before: `docs/epics/EPIC-007-compliance-ci.md` (untracked in the
working tree) committed as-is, `docs/epics/CURRENT.md` mirrored, EPIC-007 marked current in
`docs/backlog.md` (already done during EPIC-004's own closeout), plan into
`docs/epics/plan-EPIC-007.md`, then implement, self-review, push, PR, squash-merge once CI is
green. The five deliberate-failure criteria: break, capture the failing run, revert, on a scratch
branch that never merges. Finish with report, session log, backlog status, `CURRENT.md` →
EPIC-080.

**Plan summary.** Written after reading the epic, `docs/decisions/ADR-002-licensing-and-repos.md`,
`.dependency-cruiser.cjs`, `turbo.json`, and `scripts/forbidden-words.mjs` — and after spiking each
genuinely new piece against real tool output first, rather than designing on paper: a first
`reuse lint` run (no `REUSE.toml` existed yet) to see the actual baseline before designing the
annotation structure; `@cyclonedx/cyclonedx-npm` run for real against this pnpm repo before ruling
it out (it fails outright — shells out to `npm ls`); a real `git-filter-repo` + `pnpm install`
against a scratch clone before writing `mirror-dry-run.sh`, to find out empirically whether a
`.public-root/` override layer (which ADR-002 mentions, for the *real* split) was actually needed
for the dry run too — it wasn't. `docs/epics/plan-EPIC-007.md` records each of these as a decision
with the evidence that drove it, not just the final choice.

**Decisions made and why.**
- **REUSE via `REUSE.toml` bulk annotations for everything outside the four public packages,
  not per-file headers.** Already the established convention here (EPIC-003's report: "packages/ui
  gets no SPDX header comment at all, matching packages/db's existing convention"); confirmed it
  scales to REUSE-compliance by writing the annotations and re-running `reuse lint` until 0
  exclusions, rather than assuming it would work.
- **License gate and SBOM from `pnpm licenses list --json`, not a dedicated CycloneDX tool.**
  `cyclonedx-npm` is built around `npm ls`, which chokes on pnpm's non-flat `node_modules` layout —
  found by actually running it and reading the failure, not by reading its docs and guessing
  compatibility. `pnpm licenses list --json` already has everything both the gate and the SBOM
  need in one call.
- **The licence gate is strict per public package (`--filter <pkg> --prod`), warning-only for
  everything else in the same run** — decision 4's "in a private package it is a review comment,
  not a block" implemented as one script with two severities, not two separate commands a reader
  has to know both exist.
- **No `.public-root/` override for the mirror dry run.** Tested whether the filtered tree's
  existing root config (unmodified `pnpm-workspace.yaml`, `package.json`, etc.) would actually
  install and test standalone before assuming it needed a replacement layer — it does, because
  `git-filter-repo` removes the private directories from disk entirely, and `pnpm-workspace.yaml`'s
  glob just resolves to whatever's left. `.public-root/` is ADR-002's mechanism for the *real*
  split (EPIC-056), which needs public-facing replacements (a public README, a root LICENSE) this
  dry run has no reason to build yet.
- **A local `file:` stub package for the copyleft-dependency deliberate-failure test**, rather than
  a real published GPL npm package. Spent a few minutes checking real candidates
  (`node-gpl`, `gpl-3.0-license`, several well-known CLI tools) and found none conveniently both
  tiny and genuinely GPL-licensed on the registry; a two-line local `package.json` declaring
  `"license": "GPL-3.0-only"` installed via `file:` tests the exact same code path
  (`pnpm licenses list` reading a declared licence field) without depending on the registry state
  of some other maintainer's package.
- **Deliberate-failure exercises on a scratch branch created from the epic branch tip, never
  pushed, deleted with `git branch -D` after the fifth revert** — satisfies "on a scratch branch
  that never merges" literally: nothing was ever pushed for it to merge *from*, and nothing of it
  persists after this session either.

**What took longer than expected / went wrong and was caught.**
- **A REUSE false-positive fix got destroyed by its own deliberate-failure commit.** While
  investigating deliberate-failure 3 (SPDX header removal), `pnpm reuse-lint` surfaced an
  unrelated, genuine false positive in this epic's *own* plan doc (prose quoting the literal SPDX
  tag syntax, the same pattern already documented for two older reports). Fixed it, but the fix sat
  as an uncommitted change when deliberate-failure 4 started; `git add -A && git commit` for
  failure 4 swept the plan-doc fix in alongside the fake-GPL-dependency change, and reverting
  failure 4 reverted both together. Caught by re-running `pnpm reuse-lint` after returning to the
  real epic branch (post scratch-branch deletion) instead of assuming the fix was still there —
  it failed, confirming the fix was gone, and it was reapplied as its own commit on the actual
  epic branch. The lesson applied going forward: commit or stash incidental fixes *before* starting
  the next deliberate-failure commit, not alongside it.
- **Finding a real, tiny, genuinely-GPL npm package took longer than expected** and was abandoned
  in favor of the local `file:` stub once it became clear this was consuming disproportionate time
  for a detail the underlying test doesn't actually depend on (the gate reads a declared licence
  field either way).

**Verification output (tail).** Full transcript in `docs/epics/reports/EPIC-007-report.md`'s
Verification section. Short form: `pnpm compliance` — all six checks green, including a real
`git-filter-repo` extraction and `pnpm test`/`uv run pytest` inside the resulting scratch clone;
`pnpm test`/`typecheck`/`lint` — unchanged, 8 packages, all green; `gitleaks detect` — clean; all
five deliberate-failure exercises produced the expected failure with the expected rule
name/message, then reverted cleanly, confirmed by re-running the relevant check after each revert.

**Open questions.** See the report's "Open questions for the advisor" — the SBOM-on-release path
is verified by code and a local dry run but not yet by an actual tag push, and the 17 real
private-package licence findings this epic's gate surfaced for the first time are worth a look
even though none of them block anything.
