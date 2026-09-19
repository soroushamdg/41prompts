<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-052 — session log

**Date:** 2026-09-17. One session, `epic/052-sdk-ts`, merged into local `main`.

**Prompt:** *"read the file prompt_continue and run it"* — the repository's `PROMPT_CONTINUE`, which
sends the reader through `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`,
`docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`, then to the next backlog row.

**A person was present**, unlike the unattended runs `docs/AUTONOMOUS.md` is written for. The loop was
followed as written anyway, because the only part that changes is who could have been asked — and
every question that came up was answerable from a file. `STOP` is still in the repository root; it
halts `scripts/run-epics.sh` and does not affect a session started by hand, which is what `HANDOVER`
says under Housekeeping.

---

## Where the project was, checked rather than remembered

`git log --oneline -15`, `ls docs/epics/reports/`, `git log origin/main..main`. EPIC-051 merged at
`d4232cc`; 35 commits on local `main` that `origin/main` does not have. `docs/epics/HANDOVER.md`
named EPIC-052 as next and said it had no epic file, and `docs/backlog.md` agreed: `todo`, depends on
050, which is done.

`▣ GATE 3` sits above Stage 5a with a `—` in its status cell, but `docs/decisions/GATE-3.md` records
it as decided (Go for Stage 4) and five epics have shipped behind it. The next undecided gate is
GATE 5, which sits *after* EPIC-055. So nothing blocked this row.

---

## Plan summary

Written to `docs/epics/plan-EPIC-052.md` before any code, per `CLAUDE.md`. Eight modules, one new
route, an ADR, and an order of work chosen so the riskiest thing came first: **the packaging**. If
`@41prompts/core` could not be bundled into a dependency-free tarball, every other decision in the
epic changed, and finding that out after writing the client would have been expensive.

The plan named three risks. One materialised in a different form than predicted (the lockfile, below);
one did not materialise at all (dependency-cruiser was content with the workspace import — it resolves
it as `local` through tsconfig paths); one was measured rather than argued about.

---

## Decisions, and why

Eight rulings, each in `docs/decisions/AUTONOMOUS.md` and argued in full in the epic file. The three
that were genuinely hard:

**1. Zero dependencies versus one implementation of the hash.** `artifact/schema.ts` forbids a second
copy of `buildHashOf`; rule 8 forbids a dependency. The resolution is that *importing* and *depending*
are different things once there is a build step — esbuild inlines core's reachable modules and the
tarball has no `dependencies` key. The probe came before the decision: a throwaway bundle of
`bindVariables` + `buildHashOf` measured **4.4 KB minified**, which made the whole approach viable
and would have killed it if it had been 40.

**2. `resolve()` synchronous.** `CLAUDE.md` rule 8 says "memory → disk → bundled → network" *and*
"never blocks a call on the network", which as a four-step fallback contradict each other. The
roadmap's own task line settles it — *background* network. The cost is that the first call in a cold
process returns nothing, and that is written into the README's second section rather than left to be
discovered.

**3. Where `artifact` may appear in a customer-visible string.** EPIC-051 had already answered it
without anybody noticing: it named its storage keys `builds/` because *"a storage key ends up in an
SDK's configuration and in somebody's access log"*. An SDK's warning messages are the same category,
so the forbidden-word gate's scope grew by one directory and eleven strings changed. Type names did
not: `Artifact` is a frozen public contract and ADR-003 marks the word "(UI only)".

---

## What took longer than expected

**The lockfile, and it was the only red gate.** `node scripts/gate-run.mjs` failed on the first
commit at step 2 of 16 — `pnpm install --frozen-lockfile` — and took eight steps down with it.
`@types/node` had been added to `packages/sdk-ts/package.json` after the `pnpm install` that wrote the
lockfile, and every local gate kept resolving it from the workspace root. A fresh clone has no such
root. Ten minutes, and **no other gate in this repository could have found it**: it is the
"local run has state CI does not" class, and a sixth distinct mechanism for it.

**The `.mts` file that was not linted until it was.** `packages/sdk-ts/build.mjs` is the first `.mjs`
*inside a package*, so `turbo run lint` reaches it, and `eslint.config.js` only gave Node globals to
`.ts`/`.tsx`. `process` was an undefined global. One config block; five minutes.

**Nothing else ran long.** The two server-side changes were half an hour together, and the SDK itself
went in roughly in the order the plan named.

---

## Three things that found defects, and one that nearly hid one

**The fuzz found three real never-throw defects on its first run**, all in `createClient`, none of
them reachable from TypeScript. That is the whole argument for fuzzing a surface whose promise is
about untyped callers.

**Writing a client for `/v1/blob` found that its ETag could never change** — a marker's key is its
prompt id, and the tag was derived from the key. It had no symptom because the route did not implement
`If-None-Match`, and it would have had a spectacular one the first time an SDK did: every publish,
silently invisible to every running application, for ever. Report §6a. `HANDOVER` lesson 18 again — the
seam between two features is where no test written from either spec looks.

**A literal NUL byte reached `never-throws.test.ts`.** Written as `"\u0000"`, landed on disk as the
byte. Git would have called the file binary and shown no diff for it, which is the exact mechanism
`pnpm binary-files` exists for. Caught with `od -c` before the first `git add` — and worth recording
that the obvious probe, `grep -P '\x00'`, **silently found nothing because macOS grep has no `-P`**.
An instrument that cannot fire is a green tick over a claim nobody tested (`HANDOVER` lesson 8, and
lesson 13's false negative).

**The one that nearly hid something: the drive's own assertion was wrong.** It asserted that every
warning the SDK raised was a `not_found`, while the drive deliberately provokes a `missing_variables`
two lines earlier. The first run reported `FAIL` against code that was behaving exactly as the two
checks above it required. The assertion now names both expected warnings, fails on a third, and
carries a control that the expected one actually fired. An assertion a correct system fails is worth
as little as one a broken system passes.

---

## The tail of the verification output

```
CI mode — every gate CI runs, every result
--------------------------------------------------------------------
  checkout
    git clone + checkout e42de308       PASS        0m02s
  ci.yml
    pnpm install --frozen-lockfile      PASS        0m07s
    pnpm lint                           PASS        0m28s
    pnpm typecheck                      PASS        0m56s
    pnpm db:migrate                     PASS        0m02s
    pnpm test                           PASS        0m47s
    playwright install chromium         PASS        0m02s
    pnpm e2e                            PASS        5m57s    4 test(s) skipped on darwin
    uv run pytest -q (sdks/python)      PASS        0m02s
  compliance.yml
    reuse lint                          PASS        0m03s
    pnpm boundaries                     PASS        0m05s
    turbo boundaries                    PASS        0m01s
    pnpm forbidden-words                PASS        0m01s
    pnpm binary-files                   PASS        0m01s
    license-gate --sbom                 PASS        0m02s
    pnpm mirror-dry-run                 PASS        0m37s
--------------------------------------------------------------------
  16 step(s), all passed, 9m12s wall
```

```
$ npx tsx scripts/drive-epic-052.mts
17 of 17 passed
```

---

## Open questions

All in the report's §11 and ADR-006's closing section. The four that are new and are Soroush's:

1. **Is the 15 KB budget about minified bytes or gzipped ones?** 15,121 against 15,360 leaves 239
   bytes; gzipped leaves 9 KB. The strict reading is implemented and the next feature very likely
   breaks it.
2. **`configure()` and a module-level `resolve()` are a singleton.** Kept because the roadmap writes
   the API that way; singletons in libraries have a known cost.
3. **The default `console.warn`, once per warning code.** Silence was the alternative.
4. **`41p-client`** as the telemetry header name — a public wire format the moment anyone opts in.

And one that is not new: **there is still no R2 bucket and no CDN**, so *"apps resolving"* — part of
GATE 5's demand measure — cannot exist. Nothing was faked and no client ping was built, because the
roadmap names a ping as the wrong answer.

---

## For the next session

**EPIC-055 is next**: the Deploy page, the Connect page, the API-keys tab, the Publishing tab and the
Publish button. Its dependencies (051, 052) are now both done. It is the last epic before `▣ GATE 5`,
which is a full stop and Soroush's decision.

Two things it inherits directly from this epic:

- **The API key is still the one thing a drive cannot create by clicking.** EPIC-055's task line owns
  that tab, and the day it exists, both drive scripts should stop minting keys directly.
- **The Connect page shows TypeScript steps and a generated-file preview.** `packages/sdk-ts/README.md`
  is now the canonical copy of what those steps say, including the exact telemetry header. They should
  agree, and the README is the one that ships to npm.
