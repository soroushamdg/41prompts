<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Handover

Where things stand as of **2026-09-14**, for whoever picks this up — person or unattended run.
One page on purpose. `docs/PROCESS.md` is how to work; this is what is true right now.

## Start here

**Next epic: EPIC-032** (web: inputs, run, results, attribution). Its file already exists and
**already carries two inherited requirements** — read those before planning, because both are things
the code made unambiguous and only the UI can make visible.

## Stages

| stage | state |
|---|---|
| Stage 0–2 | **done.** Every epic has a report and a session log. |
| **Stage 3** | **in progress.** 030 ✅ · 031 ✅ · 031a scoped · 032 next · 033 stub · 034 todo |
| Stage 4+ | untouched. GATE 3 sits after EPIC-034 and is Soroush's decision. |

EPIC-017 (legal minimum) was Stage 1's last carried debt and is **done** — Stage 1 now has none.

## What EPIC-032 inherits, and must not rediscover

Both are written into `docs/epics/EPIC-032-runs-and-attribution.md` rather than only in reports,
because a handover that lives in the report of the epic that created it is one nobody reads.

1. **The `fullyChecked: false` sentence.** EPIC-030's `RunSummary` has two booleans and
   **deliberately no `passed` field**. `noFailures` gates Live; `fullyChecked` is the honesty half.
   A prompt with ten ungradable checks is publishable — and the *only* thing standing between a user
   and believing it was verified is a sentence on the results screen. Four checkable parts are in
   the file.
2. **The cost shown to a user must say what it counts.** A cache hit spends nothing, so a re-run is
   free and the number stops matching what they ran. Both numbers are true; neither is
   self-explanatory.

## Open, and who owns it

| what | owner |
|---|---|
| **EPIC-031a** — the first real Anthropic call against staging. Scoped, not scheduled. **Needs a human**: the key is set in Coolify, and no test calls Anthropic by design. | Soroush |
| **`privacy@41prompts.ai` must exist.** Both legal pages name it as the route for every data right and for security reports. It is a Cloudflare routing rule, not code. | Soroush |
| **EPIC-006b/c/d** — Stage 0 debt, all `not scheduled`: the ~25s deploy gap, the public Coolify hostname, and staging and production sharing one R2 bucket and `postgres/` prefix. | unscheduled |
| **EPIC-090** — prototype study, `todo`, gated behind the cancelled EPIC-084. Blocks nothing. | unscheduled |
| **EPIC-071** inherited the DPA draft and the standalone Law 25 transfer assessment from EPIC-017. | later |

## Production versus main

- **Production runs `af089c7`** — checked against `/healthz`, not remembered. That is **42 commits behind `main`**.
- **No release has been cut.** `v*` tags deploy production and none is due. Staging tracks `main` and
  deploys on merge (it was on `c96413b` when this was written); production only moves on a tag.
- So everything since `af089c7` — the `/app` dead-end fix, EPIC-017's legal pages and cookie choice,
  universal analytics consent, EPIC-030, EPIC-031 — is **on staging and not on production**.
- `PROCESS.md`: tags are releases, not checkpoints. Cutting one is a decision that this is good
  enough for real users.

## Process, as it currently stands

- **Claude merges its own PRs** once every gate is green. Reversed from the 2026-09-13 no-merge rule;
  `PROCESS.md` has the three stops — a red gate, a PR needing a ruling, anything not driven in a
  browser.
- **The browser drive is a Definition-of-Done item.** Staging sign-in uses one standing, read-only
  `SELECT` of the magic-link token; the drive cleans up after itself with a second standing
  permission scoped to `claude-drive-%@example.com`. Both in `PROCESS.md`.
- **A worker or core epic has no drive**, and its report says so explicitly — an unexplained missing
  drive reads exactly like a skipped one.

## Three things this week cost, worth not relearning

1. **A test that asserts the placeholder cannot fail on the defect.** `auth.spec.ts` asserted a dead
   end as correct; `landing.spec.ts` asserted the legal pages were unwritten. Both true, both the bug.
2. **A helper that normalises state hides the defect from every test that uses it.** Two `addBlok`
   helpers ended in `page.reload()` and hid two P1s. `PROCESS.md` has the rule.
3. **A separator that can occur in a field is not a separator.** A cache key joined a prompt and an
   input; the collision would have served one request's model output as another's answer. The rule
   existed in three comments and the new code broke it anyway, so it is now a gate —
   `packages/core/src/key-collision.test.ts`, which also refuses an unregistered key builder. Its
   scan immediately found a seventh site a careful hand audit had missed.

## Gates

`pnpm test`, `pnpm typecheck`, `pnpm lint` each report **every package** with its own verdict; paste
the table, not the word "clean". `pnpm binary-files` now checks tracked, staged **and** untracked
files — it used to miss a new file until it was staged, which is when a NUL is most likely to be
introduced. `pnpm e2e` builds, so it tests the artifact that ships.

A local green is not a CI green: CI runs on a clean checkout, and the visual-regression baselines are
Linux-only and skip locally.

## Not this session's work

`PR #90` (`chore/autonomous-runner`) is an unattended runner being built in a separate session. It was
not read, touched, or extended here. Several of its files sit untracked in the working tree; leave
them alone.
