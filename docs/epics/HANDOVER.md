<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Handover

Where things stand as of **2026-09-16, after EPIC-050**, for whoever picks this up — person or
unattended run.
One page on purpose. `docs/PROCESS.md` is how to work; this is what is true right now.

**Check it against git before trusting it.** The version of this page dated 2026-09-14 said
"next epic: EPIC-032" for two days after EPIC-032 shipped, and a session started on it would have
rebuilt a finished epic. `git log --oneline -15`, `ls docs/epics/reports/`, and the `/healthz` of
both environments take a minute and are the truth.

## Start here

**Stage 5a has started. EPIC-050 is done.** The build artifact is frozen at v1, ADR-005 declares it
public and versioned, and `packages/core/src/artifact/schema.ts` is now on `CLAUDE.md`'s never-touch
list in earnest — EPIC-050's epic file was the last explicit instruction that will be given for it.

**The next epic is EPIC-051** — the server side of Publish: `POST …/publish` running the gate, R2
with immutable headers, the audit log, "Publish anyway" with a typed reason, undo, project-scoped
test/live keys. It has no epic file; write one the way 040 to 043 and 050 were written.

**Read `docs/decisions/ADR-005-build-artifact.md` before scoping it.** EPIC-051 is the first caller
of everything EPIC-050 built, and three of its decisions constrain it directly:

1. **An artifact is addressed by its content *and its proof*.** `model`, `params` and `checkSuiteId`
   are inside `buildHash`, so re-publishing byte-identical text after a fresh check suite run writes
   a **new** R2 object. This is the decision ADR-005 §7 names as most likely to be reversed, and
   reversing it is a v2 of the format — cheaper to answer before anything is published than after.
2. **`isCompatible(live, next)` is the gate row** the mockup calls *"Inputs compatible with shipped
   apps"*. It returns every break with the variable's name, so the gate can say which one.
3. **`artifactBytes()` is what goes to R2** and `buildHashOf()` is what verifies it. Neither should
   be reimplemented in `apps/web` or the SDK; a second copy of "how an artifact is serialised" fails
   by making verification quietly always pass.

**One thing EPIC-051 has to decide that EPIC-050 deliberately did not**: where the two JSON Schema
documents are served from. They are values in `@41prompts/core`, not files —
`JSON.stringify(ARTIFACT_JSON_SCHEMA, null, 2)` is the file — and their `$id`s name
`https://41prompts.ai/schema/…`, which nothing serves yet.

**`▣ GATE 3`'s status cell in `docs/backlog.md` still says `—`, and the gate is decided.**
`docs/decisions/GATE-3.md` records it: Go for Stage 4, loud launch deferred. `scripts/pick-next-epic.mjs`
reads the cell, not the decision file, so it stops on that row and will keep stopping.
**One word in that cell (`—` → `go`) unsticks it**, and only Soroush may write it — a run may edit
only its own epic's status cell.

**Read `docs/epics/reports/EPIC-050-report.md` §11 before scoping anything.** Seven open items; three
change what somebody builds:

1. **Provenance inside the content address** (§3.2 above).
2. **Nobody has reviewed the SHA-256** that now addresses every artifact. Five published FIPS 180-4
   vectors and 131 message lengths is evidence, not a review. EPIC-057's external review hour.
3. **`snapshot()` and `compile()` break an `order` tie differently** — `localeCompare` against
   code-unit `<`, where `compile()`'s own comment says why locale is wrong. Two bloks sharing an
   `order` is reachable from the canvas. Not fixed in EPIC-050 because it moves stored
   `snapshotHash` values, which are EPIC-041's dedupe key.

**What EPIC-042 left open** is unchanged and is in its report §6 and §11 — no provider has ever been
called by that epic, `MAX_INPUTS` is 100 against the roadmap's 500, five threat-model rows are
written and not added, and the judge can spend Anthropic money on a run against OpenAI.

**What EPIC-041 left open** is unchanged and is in its own report §11 — the ink-inverted diff pair,
the silent version gap, no pruning, and restore/A-B pinning the open draft without saying so.

## Stages

| stage | state |
|---|---|
| Stage 0–2 | **done.** Every epic has a report and a session log. |
| Stage 3 | **done.** 030 ✅ · 031 ✅ · 031a ✅ · 032 ✅ · 033 ✅ · 034 ✅ |
| **GATE 3** | **decided 2026-09-16** — `docs/decisions/GATE-3.md`. Go for Stage 4; **loud launch deferred**. |
| **Stage 4** | **done.** 040 ✅ · 041 ✅ · 042 ✅ · 043 ✅ (still awaiting Soroush's read of the threat model) |
| **Stage 5a** | **started.** 050 ✅ — the artifact is frozen at v1 (ADR-005). 051 · 052 · 055 to go. GATE 5 sits after EPIC-055. |

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
| **EPIC-031a's three unticked criteria** — the resolved model id, a cached repeat at zero, one real judge call. Drivable **only against staging**, which is well behind local `main`. About thirty minutes once he pushes. | next session, or Soroush |
| **`▣ GATE 3`'s backlog status cell is still `—`** while the gate is decided in `docs/decisions/GATE-3.md`. `pick-next-epic.mjs` reads the cell and stops there on every pass. One word fixes it; `docs/backlog.md` is his file. | Soroush |
| **ADR-005 §7, provenance inside the content address.** Reversible today at the cost of one schema version, expensive the moment EPIC-051 publishes anything. | Soroush |
| **Nobody has reviewed the hand-written SHA-256** that now addresses every artifact. EPIC-057's external review hour. | EPIC-057 |
| **EPIC-043's Review line** — "Soroush reads it. Every high finding has an epic." The threat model is written and the five rows are drafted; reading it and pasting them is his. | Soroush |
| **The two open `high` findings**, `043a` and `043e`. See "Start here". | Soroush |
| **Does a normalised view satisfy rule 6?** The privacy page describes that retention to users. Obtaining the real body means a `fetch` wrapper. **Cheaper to answer before EPIC-042** puts two more providers behind the same adapter. | Soroush |
| **A release is overdue, and `RELEASE-DUE.md` is stale.** It was generated at `f3fa8a2`; local `main` is well past that, and **five** epics have merged since the last release — 040, 041, 043, 042, 050 — rather than the three `docs/AUTONOMOUS.md` allows. Regenerate with `node scripts/release-due.mjs`. Cutting it starts with a push only he can make. | Soroush |
| **EPIC-042's six open questions**, report §11. The three above change what gets built next. | Soroush |
| **`privacy@41prompts.ai` must exist.** Both legal pages name it. A Cloudflare routing rule, not code. | Soroush |
| **EPIC-006b/c/d** — Stage 0 debt, all unscheduled: the ~25s deploy gap, the public Coolify hostname, staging and production sharing one R2 prefix. | unscheduled |
| **EPIC-006, EPIC-090, EPIC-071** — `deferred`, each waiting on something only Soroush can do. | Soroush |

## Where the code is

Measured 2026-09-16, against `/healthz` rather than remembered:

| | commit | |
|---|---|---|
| local `main` | EPIC-050's merge | EPIC-050 merged, 2026-09-16 |
| `origin/main` / staging | `da42eee` | **21 behind** |
| production | `af089c7` | 86+ behind; only a `v*` tag moves it |

**So staging is not serving anything from EPIC-040, 041, 042, 043 or 050**, and no staging URL is
evidence about any of them. Check `/healthz`'s `commit` before quoting one.

**A release is due.** `docs/AUTONOMOUS.md` stops the loop after every third completed epic, and 040,
041, 042, 043 and 050 are five. `RELEASE-DUE.md` was generated at `f3fa8a2` and is stale;
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
13. **Lesson 8 again, three times in one epic, and one of them was a false *negative*.** EPIC-050's
    canonical-order test needed its two objects built with keys inserted in **opposite** orders (two
    identical literals would pass against `JSON.stringify` itself); its leak denylist matched
    substrings, so `ip` matched inside `description`; and its built-app style probe read `--ink`,
    which does not exist, and reported a styled page as unstyled. **A wrong instrument reads both
    ways.** Every absence assertion now carries a control that proves it can fire.
14. **`typeof x === "object"` is true of a `Map`, a `Set`, a `RegExp` and every class instance**, and
    `Object.keys` of all four is `[]`. EPIC-050's canonical encoder serialised a populated `Map` as
    `{}` — inside the one module whose whole job is refusing values `JSON.stringify` would silently
    alter. Test the **prototype** when you mean "a plain object".
15. **A gate that goes red on a commit that changed only Markdown is still a real finding.**
    EPIC-050's CI-parity run was green on the code commit and red on the docs commit, in
    `packages/db`'s sealed-box tests, which that epic never touched. Every surface fact argued
    "flaky" — and the helper was flipping a base64url **character** rather than a byte, so when that
    character happened to be `A` it changed only a padding bit and the envelope was unchanged.
    Measured at **191 undetected flips in 3,000 seals (6.4%)**. A security test that can silently do
    nothing reads as coverage. Re-running would have hidden it for months.
16. **A `.json` file in a public package needs a `.json.license` companion**, not a `REUSE.toml`
    edit — `REUSE.toml` is on `CLAUDE.md`'s never-touch list and the repository already has nine of
    these companions under `packages/core/src`. Found before `reuse lint` had to say it.

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
