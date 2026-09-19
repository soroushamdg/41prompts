<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# GATE 5 — what it can be decided on, and what it cannot

Written 2026-09-17 by Claude Code, after EPIC-055 merged. **This is input to Soroush's decision, not
the decision.** The decision belongs in `docs/decisions/GATE-5.md`, which only he writes, and which
does not yet exist.

Stage 5a's four epics are `done` with reports, session logs and browser drives: EPIC-050 (the frozen
artifact, ADR-005), EPIC-051 (publish, the gate, the store, `/v1`), EPIC-052 (`@41prompts/sdk`,
ADR-006) and EPIC-055 (Deploy, Connect, the keys tab, the publish flow). The next row in
`docs/backlog.md` is this gate, and EPIC-053, EPIC-054, EPIC-056 and EPIC-057 are all behind it.

`docs/AUTONOMOUS.md`: *a gate is Soroush's decision, it is recorded in `docs/decisions/GATE-n.md`,
and the epics behind it are not reachable by stepping around it.* So the loop stops here. This file
is what it owes before stopping.

---

## What the gate says, verbatim

`docs/roadmap.md`:

> **▣ GATE 5 · Demand check**
> Measured, 30 days after EPIC-055: number of distinct production apps resolving from the CDN; number
> of paying or pilot customers asking for Python, CLI codegen, or source access.
> Go to 5b: ≥5 apps and ≥2 explicit asks. No-go: ship YAML/CI export as a small epic and move to
> Stage 6.

---

## The two measures, one at a time

| # | measure | where it stands, 2026-09-17 |
|---|---|---|
| 1 | Distinct production apps resolving **from the CDN** | **Zero, and not readable — there is no CDN, and production could not serve one app today.** `apps/web/lib/deploy/store.ts` picks its driver: R2 when every `R2_*` value is present, the database otherwise. No artifact bucket exists, so the database driver is what runs, and it serves the same bytes through `/v1/blob` with the same cache headers. **What it is not is a CDN, so there is no access log to count.** EPIC-051 §4.1, EPIC-052 §4.5 and EPIC-055 ruling 2 each reported this and each named the same cause: the bucket is Soroush's step. The roadmap names a client ping as the wrong answer and no epic has added one. |
| 2 | Paying or pilot customers asking for Python, CLI codegen or source access | **Zero by construction.** There is no billing — EPIC-070 (Stripe) is Stage 6 and `todo`. There has been no launch — EPIC-035 is `todo` and deferred by `docs/decisions/GATE-3.md` ("No. Deferred."). The only discovery artifact in the repository is `docs/research/discovery/survey/`, two responses, marked `n=2` and explicitly not actionable; EPIC-005 (ten ICP interviews) is `cut` and EPIC-080 is `cut`. There is nobody to have asked. |

---

## The fact that decides most of this

**Neither number can become non-zero from where the code is standing.** Measured 2026-09-17 against
`/healthz` on both environments, not remembered:

| | commit | |
|---|---|---|
| local `main` | `217c945` | EPIC-055, merged 2026-09-17 |
| staging (`origin/main`) | `da42eee` | **54 commits behind.** Still EPIC-040's epic file and GATE 3's decision |
| production | `af089c7` = `v0.5.0`, 2026-09-12 | **137 commits, 696 files behind** |

Production is on a commit from **2026-09-12**. That predates EPIC-050, so production has no frozen
artifact; predates EPIC-051, so it has no publish route, no `/v1`, and no store; predates EPIC-052,
so there is no SDK for anything to resolve with. **The measure asks how many production apps are
resolving from an endpoint production does not have.**

That is not a delay in gathering a number. It is a number that cannot exist yet.

---

## The circularity, which is the thing worth reading twice

**The gate measures how many people installed the SDK. Installing the SDK is behind the gate.**

- `packages/sdk-ts/package.json` carries `prepublishOnly: test "$GITHUB_REPOSITORY" = 41prompts/41prompts`.
  `packages/core` and `packages/cli` carry the same guard.
- `github.com/41prompts/41prompts` does not exist. Creating it is **EPIC-056**, which is Stage 5b —
  behind this gate — and which Soroush ruled (2026-09-11) must not happen earlier, because an empty
  placeholder repository reads as abandoned.
- EPIC-052's report §4.1 states it plainly: *"Nothing was published and nothing can be."*

So no customer can `npm install @41prompts/sdk` until the epic behind the gate ships, and the gate's
entry condition is customers having done exactly that. `docs/backlog.md` already wrote the first half
of this down under EPIC-006's deferral — *"All three are Stage 5b or later, behind GATE 5, so the
deferral blocks nothing before then"* — and that sentence was true until today. Today is when
"before then" ends.

**This is not an argument for either answer.** It is the reason the gate's own words cannot be
followed as written, and it is Soroush's to resolve rather than mine to route around.

---

## What the gate was kept for, which is not what it says it measures

When the measurement programme was cancelled on 2026-09-12, every kill criterion in `roadmap.md`'s
table was marked *not measured* — including M5a's own *"≥5 production apps resolving from the CDN"*,
which is measure 1 above. GATE 5 was exempted, and the roadmap gives the reason:

> **GATE 5 is untouched**, and deliberately: it guards the frozen artifact format and the SDK surface,
> which are irreversible for *technical* reasons rather than demand reasons. Nothing about cancelling
> a demand measurement bears on it.

**Those are two different gates sharing one row.** The row is titled *Demand check* and its criteria
are two demand numbers — both of which the same document marks as no longer measured elsewhere. The
reason it survived is that ADR-005 freezes the artifact and ADR-006 freezes the SDK's public API, and
Stage 5b builds a CLI, a second-language SDK and a public mirror **on top of both**. That is a
technical question — *are these two surfaces right enough to build four more things on* — and it has
nothing to do with how many apps are calling.

Worth stating because the two readings give opposite answers. On the demand reading the gate cannot
open, possibly for months. On the technical reading it is answerable today, by reading ADR-005 and
ADR-006 and deciding whether their open questions are settled enough to commit to.

**Which of the two this row is, is the decision.** Both are defensible and choosing is not mine.

---

## A third measure exists, it is weaker, and it needs no CDN

Not a recommendation — an option that is currently invisible, so that a no-go is not taken for want
of knowing it is there.

`/v1` is authenticated by API key. `apps/web/lib/deploy/api-auth.ts:40` calls `markApiKeyUsed` on
every authenticated request, which writes `api_keys.last_used_at`. So **"how many distinct API keys
resolved a prompt in the last 30 days" is one `SELECT` away**, today, with no CDN, no R2 and no
client ping.

What it can say: how many keys are live in the field, and when each last fetched. What it **cannot**
say, and the gap matters: one key can serve any number of apps, and `last_used_at` is a single
timestamp that is overwritten, so it counts *keys active in a window* rather than *distinct apps*,
and it cannot reconstruct a history. It is a proxy, and a report that quoted it as the gate's own
number would be doing the thing EPIC-055 ruling 2 refused — presenting a number nobody computed as
the one that was asked for.

It also still needs a deploy before it can count anything, for the same reason measure 1 does.

---

## What lies immediately behind the gate, if it opens

Worth knowing before deciding, because a "Go" does not land on four clear epics.

| epic | buildable by an unattended run today? |
|---|---|
| **EPIC-053** `41p` CLI | **Yes.** Depends on EPIC-052, which is done. `link`, `pull`, `check`, `run`, `decompile`, codegen and the lockfile are all local work with golden-file tests. The thin unscoped `41p` wrapper cannot be *published*, but nothing in the epic's Tests line needs publishing. |
| **EPIC-054** Python SDK | **Partly.** `fortyone.resolve()` parity, zero dependencies, `.pyi` and `mypy --strict` are buildable. **PyPI trusted publishing is not** — EPIC-006 is `deferred` and the PyPI account is Soroush's. |
| **EPIC-057** SDK threat model | **Partly.** The model, the mitigations and the two named tests are writable. **"One external review hour" needs a person.** It is also the epic that owes a review of the hand-written SHA-256 now addressing every artifact (handover, "Open, and who owns it"). |
| **EPIC-056** Open-source split | **No.** It creates `github.com/41prompts/41prompts` (EPIC-006, `deferred`), turns on npm and PyPI trusted publishing (same), and requires *"IP assignment from founder to the legal entity executed before the first push"* — and `CLAUDE.md` still names the copyright holder as `<legal entity>` "until incorporation", with EPIC-071 (lawyer) `deferred` because Soroush has declined it for now. |

So a Go opens one fully-buildable epic, two partly-buildable ones, and one that is blocked on two
deferred rows. `docs/AUTONOMOUS.md` would have a run write a `BLOCKER` on EPIC-056 rather than build
a half version of it.

**And the No-go branch names an epic that has never been written.** *"ship YAML/CI export as a small
epic"* appears twice in `docs/roadmap.md` and nowhere else in the repository — no epic file, no
backlog row. Under `docs/AUTONOMOUS.md`'s "a row with no epic file stops the loop", a no-go taken
today stops the loop again on its first step.

---

## What a reasonable reading looks like

Three, and each is defensible. **None is mine to choose.**

**1. The gate is technical, and it is answerable now.** Read it as the roadmap's own exemption says:
it guards the frozen artifact format and the SDK surface. Both are built, driven, and documented in
ADR-005 and ADR-006; EPIC-052's drive resolved a real prompt from a real published version, and
EPIC-055's drive did it with a key minted by clicking. The open questions are small and enumerated —
ADR-006's four, and ADR-005 §7's provenance question, which the handover already marks as *"no longer
cheap to reverse"*. Decide those, record the decision, and open Stage 5b with EPIC-053, which needs
nothing from anybody.

**2. The gate is demand, and it cannot be measured, so it stays shut.** The words say *measured*, and
both numbers are zero with no mechanism to make them otherwise. Under this reading nothing behind the
gate starts until a push, a tag, an R2 bucket, a CDN, a GitHub org and some customers exist — most of
which are Soroush's steps and one of which (EPIC-056) is itself behind the gate. This reading is
internally consistent and its cost is that the project stops here for as long as that takes.

**3. Neither — the row is wrong and should be rewritten before it is answered.** The demand criteria
were cancelled elsewhere in the same document; the technical reason given for keeping the row is not
what the row measures; and the measure names a CDN that the product no longer requires, since the
database driver serves the same bytes. Rewriting the row into the technical question it is actually
guarding would make it answerable, and the rewrite is one paragraph of `docs/roadmap.md` — **his
file**, which is why this is a reading and not a change.

**What would be wrong under any of the three:** treating "no apps are resolving" as evidence about
demand. Nothing has been deployed, published or launched. It is the absence of an opportunity to
measure, not a measurement — which is exactly the distinction EPIC-055 ruling 2 refused to blur when
it left the apps-resolving card out rather than rendering it empty.

---

## Also due: a release, and it is now eight epics overdue

`docs/AUTONOMOUS.md` stops the loop after every third completed epic. **Eight have merged since the
last release** — 040, 041, 042, 043, 050, 051, 052 and 055.

`docs/epics/RELEASE-DUE.md` was regenerated today at `217c945` (it had been written at `f3fa8a2` and
was stale). The figures:

- production `af089c7` = `v0.5.0`; a release would be **`v0.6.0`**
- **137 commits · 696 files changed, 93,428 insertions(+), 591 deletions(-)**
- staging is 54 commits behind local `main` and is not evidence about anything built since `da42eee`

Nothing is tagged and nothing is pushed by an agent. Cutting it starts with a push only Soroush can
make, and `PROCESS.md`'s "The local pipeline" says to expect the first push after a gap to go red —
though the 2026-09-16 push of 27 commits went green first time, which is one data point the other way.

**This matters to the gate rather than sitting beside it.** Both of the gate's measures need a
deployed production, and production is 137 commits away from having the code that would produce
either number. The release is the first step of any reading that involves measuring anything.

---

## One thing that is not this gate but stops the same loop

`▣ GATE 3`'s status cell in `docs/backlog.md` still reads `—` while `docs/decisions/GATE-3.md`
records the decision (Go for Stage 4, loud launch deferred). `scripts/pick-next-epic.mjs` reads the
cell, not the decision file, so it stops on GATE 3 on every pass and never reaches this row.

**One word in that cell unsticks it**, and only Soroush may write it: a run may edit only the status
cell of the epic it is working. Noted here because it is now blocking the picker twice over.
