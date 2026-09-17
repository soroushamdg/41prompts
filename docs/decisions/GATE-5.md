<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# GATE 5 — the decision

**Decided by Soroush, 2026-09-17.** Written down by Claude Code from his ruling in session, not made
by it. The input to this decision is `docs/epics/GATE-5-readiness.md`, which offered three readings
and chose none.

## The reading: technical. **Go to Stage 5b.**

The row is titled *Demand check* and its criteria are two demand numbers. `docs/roadmap.md` marks
those same numbers *not measured* under the cancellation of 2026-09-12, and gives a different reason
for exempting this gate from that cancellation:

> **GATE 5 is untouched**, and deliberately: it guards the frozen artifact format and the SDK surface,
> which are irreversible for *technical* reasons rather than demand reasons. Nothing about cancelling
> a demand measurement bears on it.

**That is the reading taken.** The gate's real question is *are these two surfaces right enough to
build four more things on top of* — a CLI, a second-language SDK, a public mirror and a threat model.
Both surfaces are built, driven and frozen in writing: ADR-005 for the artifact, ADR-006 for the
SDK's public API. EPIC-052's drive resolved a real published version from outside the repository;
EPIC-055's drive did it with a key minted by clicking.

**Stage 5b starts with EPIC-053**, the `41p` CLI, which is the one epic behind this gate that needs
nothing from anybody else.

## What this decision does not waive

- **Neither demand number was measured, and both are zero.** Not "measured and found low" — there is
  no CDN, no deployed production carrying `/v1`, no published package and no customers. This decision
  proceeds without the gate's own word, *measured*, exactly as GATE 3's did, and it is named here so
  that no later reader finds it ticked.
- **The circularity is unresolved, not dissolved.** The gate counts SDK installs and publishing the
  SDK is EPIC-056, behind this gate. Going forward makes that a non-issue for 053 and 057; it does
  not make `github.com/41prompts/41prompts` exist.
- **The demand question is still owed, later.** Nothing here says the product has demand. It says
  demand is not what this row can answer today.

## What Stage 5b actually contains, given the deferred rows

Recorded so that a run reaching one of these does not rediscover it:

| epic | state under this Go |
|---|---|
| **EPIC-053** `41p` CLI | **Buildable in full.** Depends on EPIC-052, done. The thin unscoped `41p` wrapper cannot be published; nothing in the epic's Tests line needs it to be. |
| **EPIC-057** SDK threat model | **Buildable except the external review hour**, which needs a person. It also owes the review of the hand-written SHA-256 now addressing every artifact. |
| **EPIC-054** Python SDK | **Buildable except the PyPI publish.** EPIC-006 is `deferred` and the account is Soroush's. |
| **EPIC-056** Open-source split | **Not buildable.** Needs the GitHub org (EPIC-006, `deferred`), npm and PyPI trusted publishing (same), and an IP assignment to a legal entity that does not yet exist (EPIC-071, `deferred`). A run that reaches it writes a `BLOCKER` rather than a half version. |

## Also outstanding

A release is due and is now **eight** epics overdue — 040, 041, 042, 043, 050, 051, 052, 055 against
the three `docs/AUTONOMOUS.md` allows. Production is at `af089c7` = `v0.5.0`, 137 commits and 696
files behind; staging is 54 behind. `docs/epics/RELEASE-DUE.md` has the commit list, regenerated
2026-09-17. **That is a separate decision and is not made here.**

## One thing this decision cannot do for itself

`docs/backlog.md`'s `▣ GATE 5` status cell still reads `—`, and so does `▣ GATE 3`'s. `docs/AUTONOMOUS.md`
lets a run edit only the status cell of the epic it is working, so neither was touched.
`scripts/pick-next-epic.mjs` reads the cell rather than this file and will keep stopping on GATE 3 on
every pass. **One word in each unsticks the picker**, and both are Soroush's to write.
