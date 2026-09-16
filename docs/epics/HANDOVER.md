<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Handover

Where things stand as of **2026-09-16**, for whoever picks this up — person or unattended run.
One page on purpose. `docs/PROCESS.md` is how to work; this is what is true right now.

**Check it against git before trusting it.** The version of this page dated 2026-09-14 said
"next epic: EPIC-032" for two days after EPIC-032 shipped, and a session started on it would have
rebuilt a finished epic. `git log --oneline -15`, `ls docs/epics/reports/`, and the `/healthz` of
both environments take a minute and are the truth.

## Start here

**Next epic: EPIC-043** — the BYO-key threat model and breach runbook. It comes **before** EPIC-042,
which is the row that actually stores a user's provider key, and the backlog orders it that way on
purpose: the review line is "Soroush reads it", so it is paper he has to read rather than code.

**Neither of the two remaining Stage 4 rows has an epic file.** Write it the way EPIC-040 and
EPIC-041 were written — `docs/PROCESS.md`'s amendment of 2026-09-15, Claude Code in the advisor's
chair — unless the epic turns out to need a person, which EPIC-043 partly does.

**What EPIC-041 left open**, its report §11 rather than only here:

1. **Both sides of a compared pair are ink-inverted in the history list.** Truthful, and with two
   versions the whole list is inverted. If only the right-hand side should be marked, it is one line.
2. **A version that fails to record is still a silent gap** (inherited from EPIC-040 §11.1).
   `recordVersionNow` never throws and nothing can currently detect the gap.
3. **Nothing prunes.** The page shows the 50 most recent and says so; ~2 MiB per 50 versions.
4. **Restore and A/B silently pin the open draft**, which changes what the next save does. Correct,
   and the page does not say it will happen.

## Stages

| stage | state |
|---|---|
| Stage 0–2 | **done.** Every epic has a report and a session log. |
| Stage 3 | **done.** 030 ✅ · 031 ✅ · 031a ✅ · 032 ✅ · 033 ✅ · 034 ✅ |
| **GATE 3** | **decided 2026-09-16** — `docs/decisions/GATE-3.md`. Go for Stage 4; **loud launch deferred**. |
| **Stage 4** | **in progress.** 040 ✅ · 041 ✅ · 043 next, then 042 |
| Stage 5+ | untouched. GATE 5 sits after EPIC-055. |

**EPIC-035 (loud launch) is behind the gate and stays `todo`.** It is not `cut`. Soroush deferred it
until the judge has run against a real model and the rule-6 question is answered.

## The first real model call happened

**2026-09-16, EPIC-031a.** Two calls to `claude-sonnet-5` from deployed staging through the Runs
page. **$0.02**, 59 in / 607 out tokens, 3.8s and 8.4s. Before that date every run in every test,
screenshot and drive was answered by a fake.

It found what it was built to find: **`result.response?.body` came back undefined**, so rule 6's
"raw provider payload" was the SDK's normalised view and **the resolved model id was never
captured**. Fixed in `ca70def` without pretending the body was obtained — `modelId` is captured and
the fallback labels itself `normalised: true`.

## Open, and who owns it

| what | owner |
|---|---|
| **EPIC-031a's three unticked criteria** — the resolved model id, a cached repeat at zero, one real judge call. **All three are now drivable**: staging has the code since the 2026-09-16 push. About thirty minutes. | next session, or Soroush |
| **Does a normalised view satisfy rule 6?** The privacy page describes that retention to users. Obtaining the real body means a `fetch` wrapper. **Cheaper to answer before EPIC-042** puts two more providers behind the same adapter. | Soroush |
| **A release is overdue, and `RELEASE-DUE.md` is stale.** It was generated at `f3fa8a2`; local `main` is ten commits past that. Regenerate with `node scripts/release-due.mjs`. Cutting it starts with a push only he can make. | Soroush |
| **`privacy@41prompts.ai` must exist.** Both legal pages name it. A Cloudflare routing rule, not code. | Soroush |
| **EPIC-006b/c/d** — Stage 0 debt, all unscheduled: the ~25s deploy gap, the public Coolify hostname, staging and production sharing one R2 prefix. | unscheduled |
| **EPIC-006, EPIC-090, EPIC-071** — `deferred`, each waiting on something only Soroush can do. | Soroush |

## Where the code is

Measured 2026-09-16, against `/healthz` rather than remembered:

| | commit | |
|---|---|---|
| local `main` | `f5e3384` | EPIC-041 merged, 2026-09-16 |
| `origin/main` / staging | `da42eee` | **10 behind** |
| production | `af089c7` | 86+ behind; only a `v*` tag moves it |

**So staging is not serving anything from EPIC-040 or EPIC-041**, and no staging URL is evidence
about either. Check `/healthz`'s `commit` before quoting one.

## Process, as it currently stands

- **Nothing is pushed. Soroush pushes.** `CLAUDE.md`'s rule, and it stands. He asked for one push by
  hand on 2026-09-16 and confirmed in the same breath that it was a one-off and the rule does not
  change. **Do not push on your own initiative, and do not edit the rule.**
- **`node scripts/gates.mjs ci` is the only CI there is** for anything not yet pushed. Run it on the
  commit, before the merge. Read its closing "what a green here still does not cover" block — it is
  part of the result.
- **`main` moves by `git merge --no-ff` from a branch**, and the merge message carries what a PR
  description carried.
- **The browser drive is a Definition-of-Done item**, against the **built** app — `turbo run build`,
  then `next start`. Never `pnpm dev`.

## Seven things recent epics cost, worth not relearning

1. **A helper that normalises state hides the defect from every test that uses it.** `PROCESS.md`
   has the rule and the three instances.
2. **A cleanup that always runs last will eventually delete the thing the run was for.** EPIC-031a's
   drive cascaded away its own evidence and the call had to be paid for twice. Verify, then tidy.
3. **`next start` needs `apps/web/e2e/env.mjs`'s placeholders**, not invented ones. Hand-made values
   give *"Something went wrong."* on sign-in — Better Auth failing to construct. That file is the
   single copy of them by design; do not write a fourth.
4. **Read the existing spec before guessing a selector.** EPIC-040 lost several minutes inventing
   `.compiled-span` + "Edit" when `compiled-pane.spec.ts` had the real flow all along.
5. **An `expected` blok emits no text**, so its words appear in no compiled prompt and no
   `prompt_text`. Two EPIC-041 drive assertions looked for them there; chasing why found a real
   defect underneath (report §3). Assert against the **snapshot** when the fact is about a blok set.
6. **The canvas reorders optimistically**, so the card moving is not the move being saved. Wait on
   the version the move records, never on the DOM order, before navigating away.
7. **When a symptom looks environmental, probe the thing.** Print the value, load the page, read the
   row. Three mysteries in three epics were each settled in under a minute that way after being
   reasoned about for much longer.

## Gates and the local loop

`pnpm test`, `pnpm typecheck`, `pnpm lint` each report **every package** with its own verdict; paste
the table, not the word "clean". `pnpm e2e` builds, so it tests the artifact that ships, and it needs
its own Postgres:

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
```

The four visual-regression baselines are Linux-only and skip on macOS. A skip is not a pass, and the
suite says so at the end of every run.

## Housekeeping

A `STOP` file has sat in the repository root since 2026-09-14. It halts `scripts/run-epics.sh`
between and during epics; it does not affect a session a person starts by hand. Remove it when the
unattended runner should move again.
