<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-051 — session log

2026-09-17 · branch `epic/051-publish-api-storage` · one session

## The prompt

`prompt_continue`, run by Soroush by hand: read `CLAUDE.md`, `docs/PROCESS.md`,
`docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`, `docs/backlog.md` and
`docs/decisions/AUTONOMOUS.md`; work out from git and the filesystem where the project actually is;
then pick up the next epic and build it to the Definition of Done. Ask at the end whether to close
the session or continue.

## Where the project actually was

Checked against git rather than taken from `HANDOVER.md`, which its own header says to distrust:

- `main` at `f4d6dd4`, the EPIC-050 merge. Clean tree. 29 commits ahead of `origin/main`.
- Every Stage 0–4 epic has a report. Stage 5a has EPIC-050 and nothing else.
- **EPIC-051 was the next row and had no epic file.** Under `PROCESS.md`'s 2026-09-15 amendment that
  is Claude Code's to write, as 040 to 043 and 050 were.
- A `STOP` file has sat in the root since 2026-09-14. It halts `scripts/run-epics.sh`; `HANDOVER.md`
  says in as many words that it does not affect a session a person starts by hand, and this was one.
- `docs/epics/RELEASE-DUE.md` is stale — generated at `f3fa8a2`, which is 38 commits back.

## Plan summary

`docs/epics/plan-EPIC-051.md`, written before any code. Six steps: the gate as pure logic in
`packages/core`; three schema changes and a `publishes` module in `packages/db`; `apps/web/lib/deploy`
with one store interface and two drivers; five routes; the tests; the drive.

Four risks were named in advance and all four behaved as written — in particular that the drive could
only reach the *passing* half of the checks row, because a failing one needs a provider key and there
is none in a test run. The failing paths are proved in `publish.test.ts` against seeded rows.

## Decisions, and why

Twelve, all in `docs/decisions/AUTONOMOUS.md` dated today, and summarised in the report §3. The four
that took the longest to settle:

1. **Route handlers, not server actions**, for publish and undo — against the grain of every other
   mutation in this app. The deciding argument was not the roadmap's wording but that a server action
   has no caller until EPIC-055 exists, which would have left this epic's central behaviour reachable
   only from a unit test. That is the shape the browser-drive rule exists to stop.
2. **Take `@aws-sdk/client-s3`** rather than hand-roll SigV4. EPIC-050 hand-wrote SHA-256 and the
   reasons it gave are precisely the reasons *not* to here: core may have no dependency at all, and
   FIPS 180-4 publishes vectors. Neither holds in `apps/web`, and there were no SigV4 vectors to
   hand — writing a signing algorithm whose only test is itself was the alternative.
3. **Build the R2 driver even though there is no bucket**, behind an interface, with a database
   driver as the other implementation. The database driver is not a stub: it is durable, shared
   between replicas, already backed up nightly, and serves the same bytes with the same headers —
   which is what let criterion C11 be a `curl` against a real response instead of a string assertion.
4. **Fix `scripts/forbidden-words.mjs`** rather than rename or exempt. The gate was stricter than
   ADR-003 and than `CLAUDE.md`'s own Definition of Done, and the names it objected to are a frozen
   public contract that cannot be renamed.

## What took longer than expected

**Working out how much of the roadmap's task line was actually reachable.** "Apps resolving derived
from CDN access logs" needs a CDN, which needs a bucket, which is Soroush's. Deciding *not* to build
a client ping — which the roadmap itself names as the wrong answer — was quick; writing it down as a
human-blocked section rather than an omission was the part that needed care.

**Two import-resolution dead ends in the drive script.** `scripts/` is not a workspace package, so a
module there cannot resolve `@41prompts/db` or `drizzle-orm` by name. `scripts/drive-epic-043.mts`
reaches into `packages/db/src/...` by path, which works for the db package but not for `drizzle-orm`.
The answer was to put the reach inside `apps/web/e2e/publish-db.ts`, where both resolve, and have
both the spec and the drive import it. Ten minutes, and it is now written down in that file.

## What the drive found that nothing else could

**Publishing did not pin the version it published.** The Versions page showed one `Draft v1` after
two publishes of different content. Report §6a. Every test was green; the artifacts were correct;
the history had quietly stopped being able to explain them.

This is the fourth epic in a row where the browser drive found something the whole test suite did
not, and it is the clearest instance yet of *why*: nothing in the suite looked at the Versions page
after publishing, because publishing has no page of its own and the Versions page belongs to another
epic. The defect lived in the seam between two features, which is exactly where a person looking at
the product finds things and a test written from one feature's spec does not.

## An hour lost to a stale server, and the rule it gives

After fixing the pin I rebuilt, restarted, re-ran the drive — and it still failed. Three checks in:
the database said `pinnedAt` was still null after a publish, while the unit test asserting the
opposite was green on the same code.

`docs/PROCESS.md`'s rule applied and worked: **probe the thing rather than reason about it.** A
twenty-line script that published through the real HTTP API and dumped `prompt_versions` after each
step settled it in one run. The cause was a `pkill -f "next-server.*3111"` that matched nothing —
`next start` spawns a child whose command line does not carry the port — so the old process still
held the socket and the "restarted" server was the previous build.

**The rule: after rebuilding, prove the server you are about to drive is the one you just built.**
A drive against a stale process reports on the previous commit and looks exactly like a defect in
the current one. It cost about an hour, and both of the intermediate conclusions it produced
("the pin does not work", "the build is stale") were wrong.

## The gates found two things reading the code did not

- **Five routes unclassified by the host split.** `lib/site/hosts.test.ts` enumerates `app/` and
  refuses an ambiguous route, and it caught all five on the first full `pnpm test`. That test was
  written for a different epic and has now paid for itself twice.
- **The vocabulary gate refusing a frozen public identifier.** Report §6c.

## Verification output, tail

```
CI mode — every gate CI runs, every result
  16 step(s), all passed, 9m16s wall        (on 228f67e)

  What a green here still does not cover
    · The runner is Linux and this is darwin: four visual-regression baselines skip here.
    · The runner is slower than this machine.
```

```
18 of 18 passed        (scripts/drive-epic-051.mts, against the built app on :3111)
8 passed (1.3m)        (apps/web/e2e/publish.spec.ts)
```

## Open questions

All in the report §11. The two that are genuinely urgent rather than merely open:

1. **ADR-005 §7** — provenance inside the content address. EPIC-050 named it the paragraph most
   likely to be reversed and said it was cheap to reverse "before EPIC-051 publishes anything".
   EPIC-051 has now published things. It is a v2 from here.
2. **An R2 bucket and a CDN.** Everything about delivery past this epic — EPIC-052's `resolve()`,
   EPIC-055's Deploy page, GATE 5's demand measure — wants them to exist.

## For the next session

**EPIC-052, `@41prompts/sdk`**, is next in Stage 5a and its dependency (EPIC-050) is done. It is the
first consumer of `/v1/marker/:promptId` and of `buildHashOf()` as a verifier, and `docs/roadmap.md`
carries a paragraph on it that is easy to miss: EPIC-013's parked question about how `packages/core`
is resolved two ways in this repo has to be settled there, because that epic decides core's `main`
and `exports` for publication.

Read this report's §8 first — variables are declared per prompt and not per version — because the
SDK's variable validation is where that asymmetry becomes visible to a customer.
