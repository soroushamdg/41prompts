<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-050 — session log

**Date.** 2026-09-16. One session, started by Soroush by hand (not `run-next-epic.sh`), with the
standing prompt in `PROMPT_CONTINUE` at the repository root: read the six documents in order, work
out where the project is from git rather than from any of them, then pick up the next epic and build
it to `docs/AUTONOMOUS.md`'s loop.

Written as if the next session has no memory of this one, because it does not.

## The prompt

> read file prompt_continue and run it

`PROMPT_CONTINUE` names `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`,
`docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`, in that order, then `git log`, `git status`,
`git log origin/main..main` and `ls docs/epics/reports/`. All read before anything was written.

## Where the project actually was

- local `main` at `eee8b3d`, EPIC-042's merge. Clean tree.
- **21 commits ahead of `origin/main`**, so staging serves a commit from before EPIC-040.
- Stage 4 complete: 040, 041, 042 `done`; 043 `built — awaiting Soroush's read of the threat model`.
- `docs/epics/HANDOVER.md` named EPIC-050 as next and said it has no epic file.
- A `STOP` file has sat in the repository root since 2026-09-14. It stops `run-epics.sh`; it does
  not affect a session a person starts by hand, and this was one.

## Two things the picker said that needed a decision before any work started

**1. `scripts/pick-next-epic.mjs` printed `GATE: ▣ GATE 3` and stopped.** It reads the gate row's
status cell in `docs/backlog.md`, which is still `—`. **GATE 3 was decided on 2026-09-16** and the
decision is in `docs/decisions/GATE-3.md`: *Go for Stage 4, loud launch deferred.* The backlog row
was never updated, because `docs/backlog.md` is Soroush's file and a run may edit only its own epic's
status cell.

So the gate is decided and the bookkeeping is not. All four Stage 4 epics were built behind the same
gap. Proceeded, cited the decision file, logged it, and it is in the handover as a one-word edit
Soroush can make (`—` → `go`) that unsticks the picker.

**2. A release is overdue and `docs/AUTONOMOUS.md` says the loop stops for one.** Five epics have
merged since the last release rather than the three that rule allows. Cutting it begins with a push,
which only Soroush can do, and `PROMPT_CONTINUE` says in as many words to pick up the next epic and
build it. Built the epic; reported the release in §13 rather than attempting it.

## Plan summary

`docs/epics/plan-EPIC-050.md`, written before any code. Nine rows of "what exists today, read rather
than remembered" — including the one that shaped everything, that `artifactOf` has **no caller
outside its own tests**, so changing its signature was free.

Order of work, each step green before the next: SHA-256 → canonical JSON → the twelve-field shape →
`isCompatible` → the JSON Schemas and the validator → the golden fixtures → the leak test → exports,
ADR-005, report.

That order is not arbitrary. Each step is the input to the next, and the first two are the ones every
other claim rests on — a wrong digest or a non-canonical encoding would make every later test pass
against a format that was quietly wrong.

## Decisions, and why

Five, all in `docs/decisions/AUTONOMOUS.md` and in the epic file. The two with real cost are in the
report §3. The short version of the reasoning that is not obvious from the outcome:

- **SHA-256 rather than the existing `hash()`** was not a preference. The digest is what EPIC-052's
  `resolve()` verifies a downloaded artifact against, and FNV-1a is collidable on a laptop, so the
  verification would have looked like an integrity check while being none. The roadmap's own task
  line already said "content-addressed sha"; nobody had implemented one.
- **Writing SHA-256 out** rather than relaxing core's zero-dependency rule: core runs in a browser
  today, inside `apps/web`'s decompiler, and `version/diff.ts` had already set the precedent and
  recorded the argument. Seventy lines with published test vectors is cheaper than a rule with an
  exception in it.
- **Provenance inside the content address** follows the roadmap literally, and is the decision most
  likely to be wrong. Named as such in ADR-005 §7, in the epic file, and in the report.

## What took longer than expected, and what did not

**Shorter than expected: the SHA-256.** It passed all five NIST vectors on the first run. The design
work that made that likely was in the comments rather than the code — writing down *why* the length
field is computed by division rather than by `>>>` before writing the line, because `bitLength >>> 32`
is 0 for every value in JavaScript and would have failed silently only above 512 MiB.

**Longer than expected: getting the tests to be worth anything.** Three separate cases where the
first version of an assertion could not have failed:

1. The canonical-order test needed the two objects built with keys inserted in **opposite** orders,
   and needed `expect(JSON.stringify(one)).not.toBe(JSON.stringify(other))` as its control. Written
   as two identical literals it would have passed against `JSON.stringify` itself.
2. The leak denylist matched **substrings**, so `ip` matched inside `description` and the format's
   own documentation field was reported as a leak. Fixed by matching word components. The
   false-positive case is kept as a test so a later tightening fails there rather than making the
   whole file noise.
3. The built-app style probe read `--ink`, which does not exist. It reported a styled page as
   unstyled. Fixed, and a deliberately-absent token is now read alongside as the control.

All three are the same shape from different directions: **an assertion about an absence needs a
positive control**, which `docs/epics/HANDOVER.md` lesson 8 already said, and which this session
re-learned three times in one afternoon.

## What the tests found that reading the code did not

**`canonicalJson` encoded a populated `Map` as `{}`.** `typeof x === "object"` is true of a `Map`, a
`Set`, a `RegExp` and every class instance, and `Object.keys` of all four is `[]`. The module's whole
purpose is to refuse values `JSON.stringify` would silently alter, and it had one door left open onto
exactly that. Found by the test case that was written because the list of "things stringify alters"
was written out first. Fixed by checking the **prototype**.

**`compile/types.ts` was saying something false about this epic.** Its `keep` comment claimed
EPIC-050's artifact builder wants a fresh compile without hand edits. EPIC-040 made that false — a
run sends the version's `compiledText`, which `snapshot()` compiles *with* them — so an artifact that
dropped them would publish text nobody ran. Corrected in place, dated, with the reason, rather than
left as a stale claim about a frozen format.

## The gate went red between two commits, and that was the most valuable hour

`gate-run.mjs` was green on `8d6aa9a` (the code) and **red on `cc31687`** (the docs commit). The
failing test was in `packages/db`, which this epic does not touch.

`PROCESS.md`'s rule is that the gate's answer is about a specific commit and no other, which is why
it was re-run on the docs commit at all rather than merged on the earlier green. Everything that
followed came from obeying that literally.

**What was tempting and is forbidden.** The failure is in another package, on another epic's test,
on a commit that changed only Markdown and a screenshot. Every one of those facts argues "flaky,
re-run it", and `PROCESS.md`'s "'Environmental' is a hypothesis, not a finding" exists because that
argument was made three times in a row and was wrong all three times.

**What it actually was.** `flipLastCharacterOfPart` flipped a base64url *character*, not a byte. The
ciphertext decodes to 62 bytes, 62 mod 3 is 2, so the last character carries two padding bits that
the decoder throws away — and `A` and `B` differ only in one of them. When the last character was
already `A` the envelope was **unchanged**, so `openProviderKey` correctly returned the key and the
test failed for having tampered with nothing.

Measured on 3,000 seals: 191 undetected, 6.4%, against a predicted 1 in 16. The probe printed the
sixteen characters the length allows — `048AEIMQUYcgkosw` — which is the part that turns an argument
into a measurement.

Fixed by decoding, flipping a real byte and re-encoding, with a control that asserts the flip
changes the bytes over 200 seals. **Proved against the old rule first:** with the original helper
restored, the new control fails; with the fix, 26 of 26 pass.

**The lesson is not about base64.** It is that a security test can pass while doing nothing, and that
the only thing standing between "it did nothing 6% of the time" and "it does nothing always" was a
gate landing on the wrong sixteenth.

## Verification output, tail

```
CI mode — every gate CI runs, every result
  checkout   git clone + checkout 8d6aa9ab       PASS  0m02s
  ci.yml     pnpm install --frozen-lockfile      PASS  0m07s
             pnpm lint                           PASS  0m22s
             pnpm typecheck                      PASS  0m52s
             pnpm db:migrate                     PASS  0m03s
             pnpm test                           PASS  0m36s
             playwright install chromium         PASS  0m01s
             pnpm e2e                            PASS  5m38s   4 test(s) skipped on darwin
             uv run pytest -q (sdks/python)      PASS  0m04s
  compliance reuse lint                          PASS  0m08s
             pnpm boundaries                     PASS  0m04s
             turbo boundaries                    PASS  0m01s
             pnpm forbidden-words                PASS  0m01s
             pnpm binary-files                   PASS  0m01s
             license-gate --sbom                 PASS  0m02s
             pnpm mirror-dry-run                 PASS  0m32s
  16 step(s), all passed, 8m35s wall

gate: all green
```

```
npx tsx scripts/drive-epic-050.mts
PASS  landing responds — HTTP 200
PASS  landing is styled, not bare HTML — --color-ink = "#111", body background = rgb(239, 237, 230)
PASS  the token probe can fail: an absent token reads empty — --no-such-token = ""
PASS  the linked stylesheet is real CSS — 200, 68695 bytes
PASS  core segments and clusters in the built bundle — 4 blok cards rendered
PASS  the source map renders — Bloks heading visible
6 of 6 passed
```

One thing about `reuse lint` worth carrying forward: the two golden fixtures are `.json`, which
cannot carry a comment header, and `REUSE.toml` is on `CLAUDE.md`'s never-touch list. The repository
already had the answer — `packages/core/src/detect/rule-shapes.json.license` and eight siblings — so
each fixture got a `.json.license` companion. **No `REUSE.toml` edit, and none was needed.**

## Open questions

Seven, in the report §11. Four are Soroush's: provenance inside the content address, an unreviewed
SHA-256, `CLAUDE.md`'s "Build sha" line, and `docs/roadmap.md`'s `LivePointer`. Two are the next
epic's: where the JSON Schema documents are served from, and the `snapshot()`/`compile()` tie-break
disagreement in report §8. One is for whoever designs a variable type system, which is that
`ArtifactVariable.type` carries the format's only permission to grow inside v1.

## For the next session

**Stage 5a continues at EPIC-051** — the server side of Publish: the endpoint, the gate, R2 with
immutable headers, the audit log, "Publish anyway" with a reason, undo, project-scoped keys. It has
no epic file; write one the way 040 to 043 and this one were written.

**Read ADR-005 before scoping it.** EPIC-051 is the first caller of everything in this epic, and two
of its decisions constrain it directly: an artifact is addressed by its content *and its proof*, so
re-publishing unchanged text after a fresh run writes a new object; and `isCompatible` is the gate
row the mockup calls *"Inputs compatible with shipped apps"*.

**Four Stage 4 epics and this one have merged since the last release.** `RELEASE-DUE.md` is stale;
`node scripts/release-due.mjs` regenerates it. Nothing is tagged or pushed by an agent.
