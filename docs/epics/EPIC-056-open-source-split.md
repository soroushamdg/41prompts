<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-056: The open-source split — a public repository that is real, and a copyright line that names somebody

Stage: 5b · Depends on: EPIC-054, EPIC-057 · Size: **M** (the backlog says S; corrected below)

**Written by Claude Code in the advisor's chair**, 2026-09-18, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-055, EPIC-057 set. The Tasks,
Tests and Review lines below are `docs/roadmap.md`'s, unchanged; the Goal and everything else is this
file's reading of them.

## Why it is buildable today, when it was not yesterday

`docs/decisions/GATE-5.md` recorded this row as **"Not buildable"** on 2026-09-17: it needed the
GitHub org (EPIC-006, `deferred`), npm and PyPI trusted publishing (same), and an IP assignment to a
legal entity that did not exist (EPIC-071, `deferred`). A run reaching it was to write a `BLOCKER`
rather than a half version.

**Soroush reported on 2026-09-18 that all three are done**, and answered the four questions this
epic turns on:

| fact | value | consequence here |
|---|---|---|
| legal entity | **`41Prompts Inc.`** | replaces `<legal entity>` in 433 tracked files |
| GitHub org and repo | **`41prompts/41prompts`** | the four `prepublishOnly` guards already test for exactly this and do not change |
| npm scope `@41prompts` | **registered** | `@41prompts/core`, `@41prompts/cli`, `@41prompts/sdk` can publish |
| npm bare name `41p` | **available, not yet registered** | `packages/cli-unscoped` keeps its name; registering it is a step only he can take |
| PyPI `41prompts` | **registered** | `sdks/python-alias` can publish |
| PyPI `fortyone-prompts` | **available, not yet registered** | `sdks/python` keeps its name; registering it is a step only he can take |

**Two of those are not yet registered, and that is a real limit on what this epic can claim.** It
builds everything up to the first publish and does not perform one. Section "What is owed to a
person" says so in the report's own numbered section rather than leaving a box that reads like an
omission.

## Why the size is corrected from S to M

`docs/backlog.md` and `docs/roadmap.md` both say S. The row was sized before anybody counted what it
touches: **433 tracked files carry `<legal entity>`**, six distributions publish rather than the
four every document still says, the mirror filter is missing one of them, and the public repository
needs continuous-integration of its own that the private one's workflows cannot supply. EPIC-017's
row size was corrected the same way and for the same reason. The correction is recorded here and in
`docs/decisions/AUTONOMOUS.md`; the backlog's `Size` cell is **not** edited, because only the status
cell of the epic being worked is this run's to touch.

## Goal

`41Prompts Inc.` is named as the copyright holder in every licence header, `LICENSE` and `NOTICE` in
the repository; the public tree can be extracted with its real history, installed and tested
standalone with **all six** public distributions present; and everything needed to publish them from
`github.com/41prompts/41prompts` is written, guarded and proved — so that the only steps left are the
ones a person has to take in a browser.

## Scope

1. **`<legal entity>` → `41Prompts Inc.`** in every licence header, every `LICENSE`, every `NOTICE`,
   `REUSE.toml`'s `SPDX-PackageSupplier`, and `CLAUDE.md`'s naming rule, which currently says the
   holder is `<legal entity>` *until incorporation*.
2. **Historical prose is not rewritten.** Where a committed report, session log or decision record
   discusses the placeholder as a then-current fact, the sentence stands — a record that says
   something different from what it said is not a record. Only licence metadata is substituted.
   The rule and its exact test are in "Notes for the implementer".
3. **The footer gets its copyright line.** `apps/web/app/site-chrome.tsx` carries a comment saying
   there is deliberately no `©` because a copyright naming a company that does not exist is a claim
   the design rules out. The company exists. The comment goes and the line arrives.
4. **URLs re-pointed to `41prompts/41prompts`** — `repository`, `homepage` and `bugs` in
   `packages/core`, `packages/cli`, `packages/sdk-ts`, `packages/cli-unscoped`, `sdks/python`,
   `sdks/python-alias`, and `REUSE.toml`'s `SPDX-PackageDownloadLocation`. **Nothing else.**
   `infra/` and the private repository's own workflows keep `ghcr.io/soroushamdg/...` and
   `soroushamdg/41prompts`: the mirror is a second repository, not a rename of the first.
5. **`packages/cli-unscoped` joins the mirror.** It is absent from `scripts/mirror-dry-run.sh`'s
   filter paths today — so `41p`, which publishes to npm with `provenance: true` and a
   `prepublishOnly` that only passes inside `41prompts/41prompts`, has no source in the repository
   it can only be published from. A contradiction, found by reading, fixed here.
6. **Governance files the public repository is read by strangers through**: a root `DCO` file
   (`CONTRIBUTING.md` already describes the sign-off and there is no file to point at),
   `SECURITY.md` with a disclosure address and the supported-versions table, `TRADEMARKS.md` saying
   what the Apache-2.0 grant does *not* cover, and `CONTRIBUTING.md` corrected — it says "Four
   packages are public" and there are six distributions.
7. **READMEs with the three-step quickstart** for each published distribution, in the shape
   `docs/roadmap.md` asks for.
8. **Publishing workflows that live in the public tree**, guarded by
   `if: github.repository == '41prompts/41prompts'` so they are inert in the private repository,
   and a `dependency-review-action` for the mirror. Trusted publishing is configured in npm's and
   PyPI's own web interfaces by Soroush; what is built here is the half that is code.
9. **`scripts/mirror-dry-run.sh` becomes an honest rehearsal of the real split** — all six
   distributions, the public tree's own root manifest and its own workflows — and a test asserts
   that a public distribution added later cannot be forgotten by it.

## Out of scope

Explicitly, and none of these may be built even though each is adjacent:

- **Creating `github.com/41prompts/41prompts` and pushing to it.** `CLAUDE.md`, "Nothing is pushed".
  The split is rehearsed here and executed by Soroush.
- **Registering `41p` on npm or `fortyone-prompts` on PyPI**, and enabling trusted publishing in
  either registry's web interface. Both are accounts, not code.
- **Publishing anything.** No `npm publish`, no `uv publish`, not even a dry-run against a real
  registry.
- **Renaming any distribution.** All six names hold; Soroush confirmed it on 2026-09-18.
- **The trademark filing.** EPIC-071, `deferred`. `TRADEMARKS.md` states the position on the names
  as used; it does not claim a registration that does not exist.
- **Re-pointing `infra/`, `.github/workflows/build-images.yml`, `deploy.yml` or `rollback.yml`** at
  the new org. Those serve the private repository and the box.
- **A `v*` tag or any release.** `docs/AUTONOMOUS.md`'s hard limit.

## Acceptance criteria

- [ ] **A1.** `git grep -l "<legal entity>"` returns only files whose match is historical prose, and
  a committed test names that allow-list explicitly. Verified by `pnpm test` in the package that
  owns the check and by the command in Verification.
- [ ] **A2.** Every **proprietary** `LICENSE` (`packages/db`, `packages/ui`, `packages/logger`,
  `apps/worker`), `LICENSES/LicenseRef-41Prompts-Proprietary.txt`, all six `NOTICE` files and
  `REUSE.toml`'s `SPDX-PackageSupplier` name `41Prompts Inc.`. Verified by the same test.
  **The six Apache-2.0 `LICENSE` files are not touched**: their trailing
  `Copyright [yyyy] [name of copyright owner]` is the licence's own appendix — instructions for
  applying it, not a claim — and filling it in would be editing the licence text. The `NOTICE`
  beside each is where the holder is named, which is what Apache-2.0 §4(d) is for. This corrects
  `docs/roadmap.md`'s Review line, which reads "Legal entity named in every LICENSE/NOTICE".
- [ ] **A3.** `pnpm reuse-lint` passes with no `<legal entity>` anywhere in a licence header.
- [ ] **A4.** `CLAUDE.md`'s naming rule names `41Prompts Inc.` and no longer says "until
  incorporation". Verified by reading the diff in self-review and by A1's test.
- [ ] **A5.** The site footer renders a copyright line naming `41Prompts Inc.`, and the comment
  explaining its absence is gone. Verified by a component test **and** by the browser drive against
  the built app, screenshotted.
- [ ] **A6.** All six distributions' `repository`, `homepage` and `bugs` URLs, and `REUSE.toml`'s
  `SPDX-PackageDownloadLocation`, name `41prompts/41prompts`. Verified by a test that reads the
  manifests rather than by grep at review time. `sdks/python/tests/test_packaging.py:142` already
  asserts the old value and must fail before it is changed.
- [ ] **A7.** `git grep -n "soroushamdg/41prompts"` outside `infra/`, `.github/workflows/` and
  `docs/` returns nothing. Verified by the command in Verification.
- [ ] **A8.** `packages/cli-unscoped` survives the mirror filter, and the filtered tree contains all
  six distributions. Verified by `pnpm mirror-dry-run`.
- [ ] **A9.** A test fails if a public distribution exists in the workspace that
  `scripts/mirror-dry-run.sh` does not carry — so the gap found in this epic cannot reopen. Proved
  to fire by removing a path and watching it fail.
- [ ] **A10.** `DCO`, `SECURITY.md` and `TRADEMARKS.md` exist at the root, each carrying a licence
  header or a `REUSE.toml` annotation, and each is included in the mirror filter. Verified by
  `pnpm reuse-lint` and `pnpm mirror-dry-run`.
- [ ] **A11.** `CONTRIBUTING.md` names six distributions, not four, and the list matches what the
  workspace actually publishes. Verified by the test from A9, which reads the same source of truth.
- [ ] **A12.** Each published distribution's README carries a three-step quickstart. Verified by a
  test asserting the heading exists in each, and by reading them.
- [ ] **A13.** The publish workflows are guarded so they cannot run in `soroushamdg/41prompts`.
  Verified by a test that parses each workflow and asserts the repository guard, because a workflow
  that runs where it should not spends Actions minutes this project has already run out of once.
- [ ] **A14.** `pnpm mirror-dry-run` passes: the filtered tree installs and tests standalone with
  its own root manifest.
- [ ] **A15.** `node scripts/gates.mjs ci` green on the commit before the merge, every gate
  reporting, no `PARTIAL`.
- [ ] **A16.** The browser drive is done against the **built** app and screenshotted into
  `docs/epics/reports/screenshots/EPIC-056/`, signed in as a fresh
  `claude-drive-056-<timestamp>@example.com`.
- [ ] **A17.** The report has a numbered section naming every step that needs Soroush, with nothing
  ticked on his behalf.

## Verification

```
# A1, A2, A4, A7 — the substitution, and what was deliberately left
git grep -l "<legal entity>"                       # only the historical-prose allow-list
git grep -n "soroushamdg/41prompts" -- . ':!infra' ':!.github' ':!docs'   # empty
git grep -c "41Prompts Inc\." -- '*/LICENSE' '*/NOTICE' REUSE.toml

# A3, A10 — licence headers
pnpm reuse-lint

# A6, A9, A11, A12, A13 — the tests that own each claim
pnpm test

# A8, A14 — the real rehearsal
pnpm mirror-dry-run

# A15 — the only CI there is
node scripts/gate-run.mjs

# A5, A16 — the drive
turbo run build --filter=@41prompts/web
# then `next start` and scripts/drive-epic-056.mts, per scripts/drive-epic-055.mts's header
```

## Notes for the implementer

**The substitution rule, exactly.** Replace `<legal entity>` where it is *licence metadata* — an
`SPDX-FileCopyrightText` line, a `LICENSE` body, a `NOTICE` body, `REUSE.toml`'s
`SPDX-PackageSupplier`, and `CLAUDE.md`'s naming rule, which is the rule the headers implement.
Leave it where it is *prose about the past*: a report that says the holder was a placeholder at the
time is describing 2026-09-16 accurately and rewriting it makes the record lie. The dividing line is
mechanical — a match on a line starting with `SPDX-FileCopyrightText` is metadata; a match inside a
sentence is prose — and the allow-list of prose files goes in the test, by name, so that a later
reader sees a decision rather than a leftover.

**`docs/epics/`, `docs/decisions/` and `docs/epics/reports/` are on `CLAUDE.md`'s never-touch list.**
Their SPDX headers are metadata and are substituted; their prose is not edited. This epic's own
files are the exception, being this epic's.

**`sdks/python/tests/test_packaging.py:142` asserts the old URL** and will fail the moment the
manifest is re-pointed. That is the test doing its job: change the assertion in the same commit and
say so, do not delete it.

**`packages/cli-unscoped` uses REUSE `.license` sidecar files** rather than header comments
(`package.json.license`, `tsconfig.json.license`, `NOTICE.license`), because JSON cannot carry a
comment. The substitution has to reach those too, and `pnpm reuse-lint` is what proves it did.

**The publish workflows must not run in the private repository.** `docs/backlog.md`'s EPIC-009
section records 2,175 billed minutes in the repository's first 8.4 days against a 2,000-minute
month. A workflow that fires on every push to the private repo and fails at `prepublishOnly` still
bills. Guard it at the job level with `if: github.repository == '41prompts/41prompts'`, and assert
the guard in a test — not in a comment.

**`scripts/mirror-dry-run.sh` already rewrites the root manifest's scripts** and says in a comment
that "Replacing the script block is what EPIC-056 will have to do at the real split anyway: the
public repository needs its own root manifest, not the monorepo's with holes in it." Take that
comment at its word: the public root manifest becomes a file in the repository that the filter
carries, rather than a `node -e` heredoc inside the rehearsal.

**The drive is real, not a formality.** This epic changes a user-visible string — the footer's
copyright line — and `CLAUDE.md` rule 12 applies to the footer as much as anywhere. Drive the apex
and one signed-in route at 390px as well as at desktop width; `BUG-069` was a header wrapping below
414px and the footer is the same class of risk.

**`/healthz` cannot identify a locally built app.** The proof that the server being driven is the
build just made is `apps/web/.next/BUILD_ID`, which appears verbatim in the returned HTML.
EPIC-052's drive did that first and it is the cheap version of the hour EPIC-051 lost.

**Nothing here reaches the box, staging or production.** No environment variable, no Coolify
setting, no deploy. `docs/AUTONOMOUS.md`'s hard limits are unchanged by the entity existing.
