<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-043 session — the BYO-key threat model, the key store, and the breach runbook

**2026-09-16.** Claude Code, one session, unattended in the sense that nobody was asked anything —
though a person started it by hand, so the `STOP` file in the repository root did not apply.

## The prompt

Read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`,
`docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`; work out from git and the filesystem where the
project actually is; pick up the next epic and build it to Definition of Done, following the loop.

## Where the project actually was

`git log --oneline -15` and `ls docs/epics/reports/` rather than the handover's word for it, because
the handover has been two days stale before.

- Local `main` at `2257a0c`; `origin/main` **12 commits behind**; nothing pushed.
- Working tree clean, on `main`.
- EPIC-040 and EPIC-041 both have reports and session logs. Stage 4's remaining rows: **EPIC-043**
  then EPIC-042, in that order deliberately — 043 is the paper that must precede storing a key.
- `docs/epics/HANDOVER.md` named EPIC-043 as next and said its file would have to be written.
- A `STOP` file has sat in the root since 2026-09-14. It halts `run-epics.sh` and does not affect a
  session a person starts, which `AUTONOMOUS.md` says in as many words.

## The plan, in one paragraph

Write the epic file in the advisor's chair (EPIC-040/041 precedent). Then: the sealed box from
`node:crypto`; the `provider_keys` store and its migration; value-shaped redaction in
`packages/logger` wired into pino, all three Sentry inits and PostHog; the threat model; the breach
and rotation sections of the runbook; and the scope-cap-revoke guidance rendered today on
`/legal/security` from one source EPIC-042 will reuse. Gate, drive against the built app, merge.

## Decisions, and why

Each of these is also one line in `docs/decisions/AUTONOMOUS.md`.

1. **The row had no epic file — write one.** EPIC-040's logged reasoning applies unchanged:
   `PROCESS.md`'s 2026-09-15 amendment is newer than `AUTONOMOUS.md`'s "an unwritten row stops the
   loop", and that rule's stated reason — an unwritten row is *unknown* — does not reach a row that
   `docs/roadmap.md` scopes fully with Goal, Tasks, Tests and Review.

2. **EPIC-043 owns the store, not only the paper.** The roadmap's own tests for this epic are
   "encryption round-trip; log scrubbing test; backup dump contains ciphertext only", and the third
   cannot be written against a table that does not exist. A threat model of a key store that does not
   exist is a threat model of a guess. EPIC-042 keeps the UI, the adapters, the toggle and the test
   button.

3. **Not libsodium.** Same construction, no dependency. Report §3.

4. **Rule 10 over the guidance's placement.** The guidance needed a rendered home before EPIC-042
   builds the input, and inventing a settings screen would be inventing product. `/legal/security`
   exists, is rendered, and already has the shape — so the copy lives in one module and the legal
   page imports it.

5. **The five high/medium findings become pasteable rows, not backlog edits.** `docs/backlog.md` is
   not an unattended run's to edit beyond its own status cell.

## What took longer than expected, and what it bought

**Probing three assertions I had already written.** `COPY … TO STDOUT` through node-postgres returns
`rows: []`, so the backup test was passing on an empty string; a `#hex` token never equals a computed
`rgb()`, so the drive's colour check was comparing against nothing; `"".startsWith("")` is true of
everything. Each cost ten minutes to catch and each would have been a green tick over a claim nobody
had tested. The rule they produce — **every assertion about an absence carries a positive control** —
is now applied in both the test and the drive.

**`__name is not defined` inside `page.evaluate`.** `tsx` compiles with esbuild's `keepNames`, which
rewrites a named inner arrow into `__name(fn, "…")`; Playwright serialises the function into the
page, where `__name` does not exist. Ten minutes, and the fix is one rule: no named inner function
inside an `evaluate` in a `.mts` drive. Written into the file so the next one does not rediscover it.

**56 GB of turbo cache and 1.0 GiB of free disk.** `pnpm typecheck` printed
`IO error: No space left on device` as a *warning* and passed anyway. `gates.mjs ci` clones and
installs, so it would have failed on something unrelated to the code. `rm -rf .turbo/cache` — it is
gitignored, and the CI mode wants a cold cache regardless — took the machine from 1.0 GiB to 58 GiB.
Worth knowing: the host disk, not Docker's VM, was the constraint this time.

**One red gate.** `pnpm e2e` failed one test on the first CI-mode run and then passed in isolation,
alone in its file, and in a full local suite. Finding the mechanism rather than re-running took
about twenty minutes and is report §7. The fix makes the test stronger than it was.

## Verification, tail

```
test — every package, every result
  @41prompts/cli   PASS      @41prompts/sdk     PASS
  @41prompts/core  PASS      @41prompts/ui      PASS
  @41prompts/db    PASS      @41prompts/web     PASS
  @41prompts/logger PASS     @41prompts/worker  PASS
  database: throwaway container
  8 checked, 8 passed

CI mode — every gate CI runs, every result
  16 step(s), all passed, 8m06s        (on 3ce248e)

EPIC-043 — the provider-key guidance and the key store, driven against the built app
  27 assertions, all PASS
  DRIVE PASSED
```

## Open questions

Report §11, all seven. The two that matter: **both `high` findings are open, and EPIC-042 should not
store the first real key until they are decided.** Neither is expensive; both are cheapest now.

## For the next session

- **Stage 4 has one row left: EPIC-042** — providers, BYO keys, the matrix, the heatmap. It depends
  on this row, and this row's report tells it not to store a real key until `043a` and `043e` are
  decided. That is a decision for Soroush, not a blocker on building the rest of 042.
- **EPIC-043's backlog row says `built — awaiting Soroush's read`**, per `PROCESS.md`'s
  "`built — awaiting <the human step>` is a backlog status". The Review line is his.
- **`origin/main` is now 16 commits behind local `main`**, and `RELEASE-DUE.md` is stale — it was
  generated at `f3fa8a2`. `node scripts/release-due.mjs` regenerates it.
- **A release is due.** `AUTONOMOUS.md` says the loop stops after every third completed epic; 040,
  041 and 043 are three. Nothing is tagged and nothing is pushed by an agent, so this is a note for
  him rather than an action.
- **The three legal pages other than security still say 14 September 2026**, correctly. If a future
  epic changes one, give it its own date rather than bumping the shared constant.
