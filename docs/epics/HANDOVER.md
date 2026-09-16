<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Handover

Where things stand as of **2026-09-16, after EPIC-042**, for whoever picks this up — person or
unattended run.
One page on purpose. `docs/PROCESS.md` is how to work; this is what is true right now.

**Check it against git before trusting it.** The version of this page dated 2026-09-14 said
"next epic: EPIC-032" for two days after EPIC-032 shipped, and a session started on it would have
rebuilt a finished epic. `git log --oneline -15`, `ls docs/epics/reports/`, and the `/healthz` of
both environments take a minute and are the truth.

## Start here

**Stage 4 is complete.** 040 ✅ · 041 ✅ · 042 ✅ · 043 ✅ — every row has a report.

**The next thing is not an epic. A release is overdue.** `docs/AUTONOMOUS.md` stops the loop after
every third completed epic; four have merged since the last one, `origin/main` is **21 commits**
behind local `main`, and `docs/epics/RELEASE-DUE.md` was generated at `f3fa8a2` and is stale.
`node scripts/release-due.mjs` regenerates it. **Cutting it starts with a push only Soroush can
make.**

**After that, Stage 5a begins at EPIC-050** — `core`: build artifact v1 (frozen), the Live/Draft
pointer, and the variable-contract compatibility check. It has no epic file; write one the way
EPIC-040 to 043 were written. **ADR-005 is part of its scope** (the artifact format declared public
and versioned), and `CLAUDE.md`'s never-touch list says
`packages/core/src/artifact/schema.ts` is frozen **once Stage 5a begins** — so read that line before
touching it, not after.

**Read `docs/epics/reports/EPIC-042-report.md` §11 before scoping anything.** Three of its six open
questions change what somebody builds:

1. **The judge silently spends Anthropic money on a run against OpenAI.** `JUDGE_MODEL` is a pinned
   Anthropic model, so it is resolved separately from the run's model — on the owner's own Anthropic
   key when they have one. Honest and rendered honestly; possibly not what Soroush wants.
2. **Rule 6's normalised payload is still unanswered**, and now applies to three adapters instead of
   one. EPIC-031a flagged it as his call and said it was cheapest to answer before EPIC-042. It was
   not answered. The handling is in **one** place now (`ai-sdk.ts`), so the fix is still one change.
3. **The platform-key fallback and the providers' reselling clauses.**
   `docs/providers/usage-policies.md` has it in full. EPIC-070 (Stripe, BYO-key unlock) is the row
   that has to answer it.

**What EPIC-042 left open**, its report §6 rather than only here:

1. **No provider has ever been called by this epic.** The e2e and the drive both run
   `FAKE_PROVIDER=1`, so nothing proves OpenAI or Google accept a key or answer a prompt. The first
   real call to either will find things a fake cannot — that is the EPIC-031a shape.
2. **`MAX_INPUTS` is 100 and the roadmap's heatmap line says 500.** Driven at 6; 100 has not been
   looked at and 500 is unreachable through the product.
3. **Five threat-model rows are still written and not added** (`docs/security/byo-key-threat-model.md`
   §8). `043a` is now decided *and* built except for setting one environment variable on each
   container; `043e` is decided with the finding that decides it.
4. **Nobody has reviewed the sealed-box crypto.** Unchanged from EPIC-043 and repeated because this
   is the epic that starts storing keys in earnest.

**What EPIC-041 left open** is unchanged and is in its own report §11 — the ink-inverted diff pair,
the silent version gap, no pruning, and restore/A-B pinning the open draft without saying so.

## Stages

| stage | state |
|---|---|
| Stage 0–2 | **done.** Every epic has a report and a session log. |
| Stage 3 | **done.** 030 ✅ · 031 ✅ · 031a ✅ · 032 ✅ · 033 ✅ · 034 ✅ |
| **GATE 3** | **decided 2026-09-16** — `docs/decisions/GATE-3.md`. Go for Stage 4; **loud launch deferred**. |
| **Stage 4** | **done.** 040 ✅ · 041 ✅ · 042 ✅ · 043 ✅ (still awaiting Soroush's read of the threat model) |
| Stage 5a | **next**, starting at EPIC-050. GATE 5 sits after EPIC-055. |

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
| **EPIC-031a's three unticked criteria** — the resolved model id, a cached repeat at zero, one real judge call. Drivable **only against staging**, which is now 16 commits behind local `main`. About thirty minutes once he pushes. | next session, or Soroush |
| **EPIC-043's Review line** — "Soroush reads it. Every high finding has an epic." The threat model is written and the five rows are drafted; reading it and pasting them is his. | Soroush |
| **The two open `high` findings**, `043a` and `043e`. See "Start here". | Soroush |
| **Does a normalised view satisfy rule 6?** The privacy page describes that retention to users. Obtaining the real body means a `fetch` wrapper. **Cheaper to answer before EPIC-042** puts two more providers behind the same adapter. | Soroush |
| **A release is overdue, and `RELEASE-DUE.md` is stale.** It was generated at `f3fa8a2`; local `main` is **21 commits** past that, and four epics have merged since the last release rather than the three `docs/AUTONOMOUS.md` allows. Regenerate with `node scripts/release-due.mjs`. Cutting it starts with a push only he can make. | Soroush |
| **EPIC-042's six open questions**, report §11. The three above change what gets built next. | Soroush |
| **`privacy@41prompts.ai` must exist.** Both legal pages name it. A Cloudflare routing rule, not code. | Soroush |
| **EPIC-006b/c/d** — Stage 0 debt, all unscheduled: the ~25s deploy gap, the public Coolify hostname, staging and production sharing one R2 prefix. | unscheduled |
| **EPIC-006, EPIC-090, EPIC-071** — `deferred`, each waiting on something only Soroush can do. | Soroush |

## Where the code is

Measured 2026-09-16, against `/healthz` rather than remembered:

| | commit | |
|---|---|---|
| local `main` | EPIC-042's merge | EPIC-042 merged, 2026-09-16 |
| `origin/main` / staging | `da42eee` | **21 behind** |
| production | `af089c7` | 86+ behind; only a `v*` tag moves it |

**So staging is not serving anything from EPIC-040, 041, 042 or 043**, and no staging URL is
evidence about any of them. Check `/healthz`'s `commit` before quoting one.

**A release is due.** `docs/AUTONOMOUS.md` stops the loop after every third completed epic, and 040,
041, 042 and 043 are four. `RELEASE-DUE.md` was generated at `f3fa8a2` and is stale;
`node scripts/release-due.mjs` regenerates it. Nothing is tagged or pushed by an agent.

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

## Nine things recent epics cost, worth not relearning

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
8. **Every assertion about an absence needs a positive control.** EPIC-043 wrote three that could
   never fail: `COPY ... TO STDOUT` returns `rows: []` through node-postgres, a `#hex` token never
   equals a computed `rgb()`, and `"".startsWith("")` is true of everything. Each read as a green
   tick over a claim nobody had tested. Before asserting a thing is missing, prove the search can
   find it.
9. **No named inner function inside a `page.evaluate`** in a `.mts` drive. `tsx` compiles with
   esbuild's `keepNames`, which rewrites it to `__name(fn, "...")`; Playwright serialises the
   function into the page, where `__name` does not exist, and it throws a `ReferenceError` that says
   nothing about the cause.

10. **A test asserts about state it created itself.** Playwright shuts its worker down after a
    timeout and starts a fresh one, which **re-runs `beforeAll`** — so a `Date.now()` identity is a
    different user afterwards, and every test that depended on an earlier test's data fails for
    reasons of its own. EPIC-042: one real defect, four failures, three of them fiction. Settled by
    polling the table from outside the run, not by reading the code (lesson 7, again).
11. **A test seam in one of two callers is not a seam.** EPIC-042's fake key-verifier lived in
    `apps/web`; the worker's job called the real verifier directly, and the suite made a genuine
    HTTPS call to `api.anthropic.com`. It is now one function in `packages/db` that nothing bypasses.
12. **A fixture where everything passes cannot show a difference.** EPIC-042's drive rendered six
    green heatmap cells, so the shape difference `CLAUDE.md` rule 10 turns on had never been looked
    at by anybody. Put a failure in the fixture, then read the **computed** style rather than a
    class name.

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
