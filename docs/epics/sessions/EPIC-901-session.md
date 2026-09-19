<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-901 — session log

**Date.** 2026-09-18 into 2026-09-19. Branch `epic/901-security-audit`.
**Prompt sent.** `PROMPT_CONTINUE` — read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`,
`docs/epics/CURRENT.md`, `docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`; work out where the
project actually is from git and the filesystem; pick up the next epic and build it.

## The session started by not building anything

`node scripts/pick-next-epic.mjs` prints `GATE: ▣ GATE 3` and stops. Reading further, that is a
stale status cell — `docs/decisions/GATE-3.md` records Go on 2026-09-16 and `GATE-5.md` Go on
2026-09-17, and EPIC-072's decision log already recorded proceeding past it for the same reason.

The real finding was what is behind the cell. **Every remaining row that delivers product needs
Soroush**, verified row by row against the backlog rather than from `HANDOVER.md`:

| row | why it cannot start |
|---|---|
| EPIC-035 loud launch | deferred by his own GATE 3 ruling; Show HN and Product Hunt are posts by a person |
| EPIC-070 Stripe | needs a Stripe account |
| EPIC-071 legal full | `deferred`, lawyer declined |
| EPIC-073 launch 2 | depends on EPIC-035 |
| EPIC-064 research | two recruited newcomers |
| EPIC-060–063 lessons | depend on EPIC-064; Stage 6 is not complete |
| EPIC-006b/c/d | `not scheduled` |

So the session stopped and asked, with four options and a recommendation, and he chose **EPIC-901**
— an Ongoing row, buildable with nothing from him, and one that has never run in the repository's
3.4-week life.

**Before asking**, the tree was verified green rather than assumed: `pnpm test` 9/9, `typecheck`
9/9, `lint` 12/12, and the built app served on 3100 with an 84KB stylesheet and every public route
200. That is what makes "the product is built and works" a statement rather than a claim.

## Plan summary

Five checks behind one command; a baseline that makes a green mean "nothing changed"; a key
inventory checked in both directions; the month's findings written up; and the proprietary boundary
extended from four packages to every tree `REUSE.toml` declares.

The plan was written **after running all five checks by hand**, so §0 of
`docs/epics/plan-EPIC-901.md` is measurements and not predictions. That turned out to matter: the
102-file licence finding is not on the roadmap's line and would not have been in a plan written
from the row.

## Decisions and why

Ten, all in `docs/decisions/AUTONOMOUS.md`. The three that shaped the epic:

1. **The finding id is rule + path + hash of the matched text**, not gitleaks' own
   `commit:file:rule:line`. A baseline keyed on line numbers goes stale on every commit, and a
   baseline people regenerate on every commit is a rubber stamp.
2. **Nine licence findings were fixed, not baselined.** `MIT-0`, `BlueOak-1.0.0` and `CC0-1.0` went
   into `ALLOWED_LICENSES`. A baseline entry is for something accepted *despite* being a concern.
3. **`pnpm audit-run` is not wired into `gates.mjs ci`.** That mode's whole claim is parity with CI,
   and CI runs neither gitleaks nor pip-audit.

## What took longer than expected

**The licence-header fix, and every minute of it was the gate being wrong rather than the headers.**

- The first version matched any occurrence of the SPDX string and flagged four files that merely
  *describe* a header — including `scripts/license-gate.mjs` itself, which matches on its own
  failure message. EPIC-056 shipped this exact bug (`7f8b67f`) and the repository had already
  written it down. The fix is to reproduce REUSE's algorithm: first declaration on a line of its
  own, after the ignore spans.
- Writing the SPDX tag and the ignore markers as literals inside `license-gate.mjs` closed that
  file's own ignore span 99 lines early and made `reuse lint` report the gate as having **no
  licensing information at all**. Found by running `pnpm reuse-lint` after the change, not by
  reading. Both files now build those strings from fragments.
- Then `turbo boundaries` refused the test's import of `scripts/license-boundary.mjs`, correctly.
  The tests were rewritten to drive the modules in a child process, which is what
  `apps/web/binary-files.test.ts` already does.

**And the one that was worth all of it:** the real-tree assertion was verified by flipping a header
and watching the test fail — and it **passed**, because the file was new and `git ls-files` reads
the index. That is `docs/PROCESS.md`'s failure 2 arriving inside the gate written to prevent its
cousin. The scan is now tracked + staged + untracked-not-ignored, the same union
`binary-files.mjs` uses, and both the test and the gate fail on the regression now.

## Two things about the environment

1. **The session rolled over mid-gate** and `/tmp` was cleaned, taking the first `gates.mjs ci`
   output with it. The three commits were intact; the gate was re-run on the final commit.
2. **`app-icon.jpg` appeared untracked at the repository root** from another Claude Code session
   sharing this worktree. It is not this epic's, so it was neither committed nor deleted —
   `gates.mjs ci` needed `--allow-dirty`, which still clones the commit and says the file was not in
   it. Report §6.1. A reminder that `git add -A` is not safe in this worktree.

## Verification output

```
audit — every check, every result
--------------------------------------------------
  npm-advisories        PASS        810 dependencies, 3 accepted
  python-advisories     PASS        4 audited of 6 exported (2 excluded by an environment marker)
  secrets               PASS        13 raw hits over the whole history, 13 accepted
  licences              PASS        639 dependencies, SBOM written by the gate, 8 accepted
  key-inventory         PASS        25 in use, 25 documented
--------------------------------------------------
  5 checked, 5 passed

License gate: proprietary boundary intact (4 packages, 9 trees, 4 named header exemption(s)).
License gate: clean. 0 public-package dependencies, 639 total in the workspace, 8 private-only warning(s).

reuse lint: Files with license information: 1292 / 1292 — compliant

test 9/9 · typecheck 9/9 · lint 12/12 · compliance green
drive 35/35 against the built app on 3119, BUILD_ID qWmShJdvg3LQFVHu1G_bQ
```

## Open questions

Report §9 has three. The one that matters most is §8.1: **four files in `docs/decisions/` still
carry the wrong licence header and only Soroush may fix them.** A test asserts the exemption list is
exactly those four *and that each still needs its exemption*, so the list shrinks the moment one is
corrected.

## For the next session

`docs/epics/HANDOVER.md` is updated. The short version: the product is built through Stage 5b plus
EPIC-072 and now EPIC-901, every remaining product row needs him, a release is **200 commits**
overdue, and `pnpm audit-run` is the thing to run once a month.
