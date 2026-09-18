<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-056: the open-source split

Written 2026-09-18, before any code. `docs/epics/EPIC-056-open-source-split.md` is the epic.

## What I measured first, rather than assumed

| claim | how it was measured | result |
|---|---|---|
| how many files carry the placeholder | `git grep -l "<legal entity>" \| wc -l` | **433 tracked files** |
| how many of those are licence metadata | `git grep -n … \| grep -c SPDX-FileCopyrightText` | **423 lines** |
| the remainder | the other 38 lines, read one by one | **19 metadata, 19 prose** |
| is `packages/cli-unscoped` in the mirror | read `scripts/mirror-dry-run.sh`'s `--path` list | **absent** |
| what the Apache `LICENSE` files say | `tail -15 packages/core/LICENSE` | the **unfilled appendix**, correctly |
| what asserts the old repo URL | `git grep soroushamdg/41prompts` | 14 manifest lines, 1 test, `REUSE.toml` |

The last two changed the epic file before it was committed: the Apache `LICENSE` appendix must
**not** be filled in, and `sdks/python/tests/test_packaging.py` will fail on the re-point by design.

## The order, and why it is this order

**1. The substitution first, because everything else inherits it.** Any file this epic creates
carries a copyright header, and creating them before the holder is settled means writing the
placeholder into new files and substituting it out again in the same epic.

**2. The mirror gap second**, because it changes what the public tree *is*, and every later step
(governance files, workflows, READMEs) has to land inside that tree rather than beside it.

**3. Governance, READMEs and workflows third**, once there is a tree for them to be in.

**4. The tests last but written alongside** — each acceptance criterion names the test that owns it,
and a test written after the fact tends to assert what the code does rather than what was wanted.

## Step 1 — `<legal entity>` → `41Prompts Inc.`

**1a. The 423 `SPDX-FileCopyrightText` lines.** Mechanical, every tracked file, including
`docs/**` (their headers are metadata; their prose is not touched) and the four `.license` sidecar
files `packages/cli-unscoped` uses because JSON cannot carry a comment.

Done with a script over `git grep -l`, restricted to lines beginning `SPDX-FileCopyrightText`, so
the edit cannot reach prose by accident. **Not `sed -i` across whole files** — that is exactly how
the prose in a report would get rewritten without anybody seeing it.

**1b. The 19 metadata lines that are not SPDX headers**, by hand:

- `LICENSES/LicenseRef-41Prompts-Proprietary.txt` (2) — the proprietary licence body
- `apps/worker/LICENSE`, `packages/db/LICENSE`, `packages/logger/LICENSE`, `packages/ui/LICENSE` (2 each)
- the six `NOTICE` files (1 each)
- `REUSE.toml`'s `SPDX-PackageSupplier`
- `CLAUDE.md`'s naming rule — the rule the 423 headers implement, so it is metadata, not prose

**1c. The 19 prose lines stay.** `docs/epics/plan-EPIC-000.md`, `EPIC-000-repo-scaffold.md`,
`EPIC-017-legal-minimum.md`, `GATE-5-readiness.md`, four reports, two session logs,
`docs/reviews/2026-09-specialist-review.md`. Each describes the placeholder as a fact of its own
date and each is accurate about that date.

**`docs/decisions/ADR-002-licensing-and-repos.md` also stays, for a second reason.** Its line 14
says the holder is a placeholder "until incorporation" and that the assignment is "executed before
EPIC-056" — which is now true, so the ADR is a decision that has been *carried out* rather than one
that is wrong. It is also on `CLAUDE.md`'s never-touch list. **It is left, and named in the report
as something for Soroush**, because an ADR that reads as current and is not is a trap, and editing
it is not this run's to do.

**1d. The test.** `scripts/legal-entity.test.mjs` (or the nearest existing home) asserts:

- no `SPDX-FileCopyrightText` line anywhere contains `<legal entity>`;
- every proprietary `LICENSE`, the proprietary licence text, all six `NOTICE`s and `REUSE.toml`
  name `41Prompts Inc.`;
- the files still containing the placeholder are **exactly** a named allow-list — so a new file
  written with the placeholder fails, and so does deleting a historical record to make a check pass.

## Step 2 — the footer's copyright line

`apps/web/app/site-chrome.tsx:98` is a comment explaining why there is no `©`. The reason has
expired. The line arrives, the comment goes, and a component test asserts the rendered text. Driven
in a browser at desktop width and at 390px, because `BUG-069` was a wrap below 414px in the sibling
chrome.

## Step 3 — re-point the URLs

Six manifests × three fields, plus `REUSE.toml`'s `SPDX-PackageDownloadLocation`:
`soroushamdg/41prompts` → `41prompts/41prompts`.

**`infra/`, `.github/workflows/build-images.yml`, `deploy.yml`, `rollback.yml` and `infra/README.md`
are not touched.** They name the private repository and the images the box pulls; the mirror is a
second repository, not a rename. `docs/roadmap.md` says exactly which URLs move and this is that
list plus the two distributions that did not exist when the line was written.

`sdks/python/tests/test_packaging.py:142` asserts the old value. Its assertion moves in the same
commit, and the report says so rather than the test quietly changing.

A test reads all six manifests and asserts the org, so this cannot drift back.

## Step 4 — `packages/cli-unscoped` joins the mirror

Add it to `scripts/mirror-dry-run.sh`'s `--path` list. Then the part that matters more: **a test that
fails when a publishable distribution is missing from that list.** It derives the set of public
distributions from the workspace (a `package.json` with `publishConfig.access: public`, plus the two
`pyproject.toml`s) and compares it against the paths the script carries. Proved to fire by removing
a path and watching it fail, and the proof goes in the report.

This is the defect this epic found by reading: `41p` publishes with `provenance: true` and a
`prepublishOnly` that only passes inside `41prompts/41prompts`, and its source was not in the tree
that becomes `41prompts/41prompts`.

## Step 5 — the public tree's own root manifest

`mirror-dry-run.sh` rewrites the root `package.json` scripts with a `node -e` heredoc and a comment
saying EPIC-056 will have to do this for real. It becomes a real file — `mirror/package.json` — that
the filter carries and renames to the root. Same for the public tree's `README.md`, which today
would be the monorepo's README describing `pnpm dev`, `pnpm db:migrate` and `pnpm e2e`, none of
which exist in the public tree.

## Step 6 — governance files

- **`DCO`** — the Developer Certificate of Origin 1.1 text, verbatim. `CONTRIBUTING.md` already
  describes the sign-off and has nothing to point at.
- **`SECURITY.md`** — how to report, where to, and what the supported versions are. The address is
  `security@41prompts.ai`; **it does not exist yet** and that goes in the report beside
  `privacy@41prompts.ai`, which the handover already lists as owed.
- **`TRADEMARKS.md`** — what Apache-2.0 does not grant. Written against what is true: names in use,
  no registration, EPIC-071 deferred. It does not claim a filing.
- **`CONTRIBUTING.md`** — "Four packages are public" becomes six distributions, from the same source
  of truth the Step 4 test reads.

All four are carried by the mirror filter and annotated in `REUSE.toml`.

## Step 7 — publishing workflows

Two workflows in the public tree: npm (three scoped packages plus `41p`) and PyPI
(`fortyone-prompts` plus `41prompts`), both on a `v*` tag, both using trusted publishing (OIDC, no
token in a secret), both guarded:

```
if: github.repository == '41prompts/41prompts'
```

**The guard is tested, not commented.** A workflow that fires in the private repository and dies at
`prepublishOnly` still bills Actions minutes, and this project has run that allowance to zero once
already. A test parses each workflow file and asserts the guard is present on every job.

Plus `dependency-review-action` for the mirror's pull requests.

## Step 8 — READMEs

A three-step quickstart in each published distribution's README, in `docs/roadmap.md`'s shape. A test
asserts the heading exists in each — cheap, and it is the difference between "we wrote them" and
"they are all there".

**`packages/sdk-ts/README.md` is pinned** by `apps/web/lib/connect/steps.test.ts`: the Connect page
may not show a snippet the README does not have. Anything I change in that README has to keep that
test green, which is the mechanism working.

## Step 9 — gates, drive, merge, report

`node scripts/gate-run.mjs` on the committed tree — it resolves to `gates.mjs ci`, which refuses a
dirty tree, so the commit comes first. Then the drive against the **built** app per
`scripts/drive-epic-055.mts`'s header, screenshots into
`docs/epics/reports/screenshots/EPIC-056/`. Then `git merge --no-ff` into local `main`. Then the
report, the session log, `docs/decisions/AUTONOMOUS.md`, and the backlog status cell.

## What this plan will not do

No push, no repository creation, no publish, no registration, no trusted-publishing configuration,
no tag, nothing on the box. Every one of those is a person's, and the report has a numbered section
listing them with nothing ticked on anyone's behalf.

## The risk I expect to bite

**The 423-line substitution touching a snapshot fixture.** `packages/core/src/*/fixtures/snapshots`
accounts for 53 files, and a snapshot whose header changes is a snapshot whose bytes change. If any
test compares a fixture file's full contents rather than its parsed payload, it fails — and that is
the correct outcome, not something to work around. `pnpm test` after step 1a, before anything else,
is how I find out early rather than at the gate.
