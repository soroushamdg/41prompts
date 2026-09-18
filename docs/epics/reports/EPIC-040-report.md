<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-040 report — versions and semantic diff

Date: 2026-09-16 · Branch `epic/040-versions` · Stage 4's first epic

A version is now a frozen blok set with an ordinal a person counts in, every run points at one, and
`diff(a, b)` says what changed between two of them in the words somebody would use.

---

## 1. The question this epic existed to answer, and the answer

**When is a version minted?**

`docs/roadmap.md` says *"version on save and before run"*. Taken literally the first half is
unusable: `blok-editor.tsx` autosaves on a 600 ms debounce, so a typed paragraph is a dozen saves.
A dozen versions per paragraph is a history nobody reads, and EPIC-041's entire value is that
somebody reads it.

**Three rules instead**, in `packages/db/src/versions.ts`:

| | rule | effect |
|---|---|---|
| 1 | a save whose `compiledHash` matches the newest row writes **nothing** | most debounce ticks cost nothing at all |
| 2 | while the newest row is unpinned it is **rewritten in place**, same `n` | editing is one episode, not one row per pause |
| 3 | **a run pins it**, and the next save mints `n + 1` | every run points at something that can never change again |

**One version per episode of editing between runs.** No timer, no background job, no arbitrary quiet
window anybody would have to defend later.

**Soroush chose this over an explicit "save a version" button**, 2026-09-16, on the argument that
decided it: automatic guarantees every run points at a version you can return to; a button
guarantees it only when somebody remembered to press one first — and the moment they forget is
exactly the run they later want to explain.

Measured in the drive: three bloks, six-plus writes, **one row**.

## 2. `diff(a, b)` matches by id, and that is the whole design

`docs/roadmap.md`'s named test is *moved ≠ removed + added*, and a text-matching diff cannot pass it.
Faced with a dragged blok it sees text where there was none and none where there was text, and the
only honest thing it can say is "one removed, one added" — telling a reader they deleted and retyped
a paragraph they actually moved. A blok id is stable across every edit to its text, so identity here
is a fact rather than an inference, and the fixture that proves it is
`packages/core/src/version/diff.test.ts`.

Three consequences worth stating because each was a decision:

- **`changed` and `moved` are separate lists and a blok may be in both.** "You rewrote it" and "you
  moved it" are two facts, and collapsing them loses whichever the reader did not ask about.
- **Reclassification is a change, not a move**, and carries `previousKind`. A blok going `context` →
  `constraint` keeps every character and still changes the compiled prompt, because `expected`
  compiles to a check and emits no text. A reader looking at identical `before` and `after` needs
  telling what actually moved.
- **Position is an ordinal, never the fractional `rank`.** `packages/db/src/rank.ts` mints
  lexicographic keys whose only meaning is their order against siblings; a rebalance rewrites every
  one of them without moving anything. A rank-comparing diff would report that as "everything
  moved" — false, and the least useful sentence a history can contain.

## 3. Pass rate is derived, never stored

There is **no `passRate` column**. `passRateForVersions` joins `suite_runs` and `suite_results`.

EPIC-034's precedent is narrow and explicit: the one thing it stored rather than derived,
`passedNotifiedAt`, was stored because "we already told PostHog" is a fact with **no other home**. A
pass rate has one. A column would be a second copy that can disagree with the first, and something
would then have to decide which is true — a decision always written after the bug.

`rate` is **null, not 0**, when nothing was graded. EPIC-030's design makes `not_graded` a third
outcome that is never folded into a fail, and reporting `0` would say the version failed everything.
A test asserts a result changing from `fail` to `pass` moves the rate **without any write to
`prompt_versions`**.

## 4. A defect found while wiring, which no unit test would have caught

`snapshot()` first compiled with plain `compile(bloks)` — **no `keep`**. A prompt with a hand-edited
span would then have produced a version whose `bloks` recorded the edit and whose `compiledText` did
not contain it: two halves describing different prompts, and a `compiledHash` that could never agree
with the `promptHash` of the run pinned to it.

Neither package's own tests could see it. `packages/core` was self-consistent and `packages/db`
takes the snapshot as `unknown`. It surfaced at the seam, which is why there is an e2e test and a
drive step for exactly this — both assert the newest version's compiled text **is what a run would
send**, hand edit included.

## 5. The measurement the roadmap asked for

*"Snapshot size at 100 × 50 acceptable."* That cannot be answered without a number.

| | |
|---|---|
| 100 bloks, one version | **41.2 KiB** |
| × 50 versions | **2.01 MiB per prompt** |
| growth, 10 → 100 bloks | **×9.86** — linear, so the figure above extrapolates |

`packages/core/src/version/size.test.ts` prints these on every run. It **reports rather than gates**,
for the reason `docs/PROCESS.md` gives under "Three timing gates report rather than enforce"; its one
hard assertion is a 64 MiB ceiling that only a super-linear regression could reach.

A snapshot is inherently about twice its prose — once verbatim per blok, once compiled. That is the
price of never recompiling history, and it is asserted so nobody meets it as a surprise.

## 6. Acceptance criteria

- [x] **`prompt_versions` exists** with prompt, `n`, snapshot, compiled text, compiled hash, note,
      `pinnedAt`, timestamps — migration `0010_real_angel.sql`. A test asserts the column set
      **has no `passRate`**, so §3's decision cannot be quietly undone.
- [x] **A save that changes nothing writes nothing.** `versions.test.ts`, "returns unchanged and
      leaves one row with one `updatedAt`".
- [x] **A save that changes something rewrites the open draft** and does not increment `n`. Also
      "absorbs ten edits into one version".
- [x] **Triggering a run pins the version**, and the next save mints `n + 1`. Proved at three levels:
      `versions.test.ts`, `versions.spec.ts`, and the drive (§7).
- [x] **`diff(a, b)` classifies added, removed, changed and moved** and returns the compiled byte
      delta. 16 tests in `packages/core/src/version/diff.test.ts`.
- [x] **A moved blok is reported as moved, never as removed plus added.** Its own describe block,
      plus an explicit "never reports the same blok as both removed and added".
- [x] **Pass rate is derived, not stored.** §3, with the test that changes a result and watches the
      rate follow without a version write.
- [x] **Snapshot size at 100 × 50 measured and in the report.** §5.
- [x] **Vocabulary.** `Draft vN` per ADR-003; `pnpm forbidden-words` PASS. This epic adds **no
      user-visible string at all** — see §8.
- [x] **`node scripts/gate-run.mjs` green on the commit before it merged.** §9.

## 7. The drive, against the built app

`scripts/drive-epic-040.mjs`, committed so it can be re-run rather than believed. Screenshots in
`docs/epics/reports/screenshots/EPIC-040/`.

**What it is for, stated plainly: this epic renders nothing.** There is no Versions page — that is
EPIC-041 — so this is not a drive of a new screen. It is a drive of the risk this epic actually
carries: a write was added to **all eight** mutating canvas actions and to the run trigger, which
are the paths a person uses constantly. A regression there would not look like a missing feature, it
would look like editing being broken, and that is precisely the class of failure a built app can have
and a dev server cannot.

Every check passed:

```
PASS  the built app is styled — rgb(239, 237, 230), Archivo
PASS  three bloks and six-plus saves produced one version — 1|-
PASS  editing a blok rewrites the open draft rather than minting — 1|-
PASS  triggering a run pinned Draft v1
PASS  the run points at the version it ran — pv_03092ee48eaa5d90
PASS  the edit after the run opened Draft v2 — 2|- 1|pinned
PASS  v1 is frozen — it does not contain the later edit
PASS  the newest version's compiled text is what a run would send, hand edit included
PASS  every blok is still on the canvas after all of that — 5 bloks
PASS  no horizontal overflow at 390px
```

**Cleanup runs first and last — and last is after the verification, never as an unconditional final
act.** EPIC-031a's drive deleted its own user as its last step and cascaded away the very evidence
that epic existed to collect. The reasoning is in this script's code so the ordering is not
rediscovered a third time.

**One thing the drive needed that is worth writing down.** `next start` with hand-invented
environment values produced *"Something went wrong."* on sign-in — the documented Better Auth
construction failure. The fix was not to invent better values but to take them from
`apps/web/e2e/env.mjs`, which is the single copy of them by design. Probing the page rather than
reasoning about the timeout settled it in about a minute.

## 8. No user-visible string, and no Versions page

Said in its own section rather than left as an unticked box that reads like an omission
(EPIC-030 §11's shape).

This epic ships **no route, no component and no user-visible string**. Everything it adds is a table,
a pure function, and a call at the end of nine server actions. The `Draft` wording already on the
prompt page predates it. EPIC-041 is the Versions page: history, restore, A/B — and it is what will
make any of this visible.

The drive above therefore asserts **the absence of a regression** and the presence of database
facts, not the appearance of a feature.

## 9. Verification

```
pnpm test        # 8/8 PASS, every package reporting, database from the environment
pnpm typecheck   # 8/8 PASS
pnpm lint        # 11/11 PASS, including dependency-cruiser, turbo boundaries, forbidden words
pnpm e2e         # 209 passed, 4 skipped (Linux-only visual baselines)
node scripts/gate-run.mjs   # 16 steps, all passed, 7m59s, on 69f8af4
node scripts/drive-epic-040.mjs   # with the built app on :3000 — see the script header
```

**What the green gate does not cover**, printed by the run and repeated here because it is part of
the result:

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and skip here. This epic changes no component, so the layout gate has nothing to say about it —
   but that is an argument, not a run.
2. **The runner is slower.** A test that only fails under load passes here.
3. **`origin/main` had one commit this checkout did not** (the merge of the docs branch). The merge
   back is clean; a semantic conflict would be invisible to the gate.

## 10. New dependencies

**None.**

## 11. Open questions for Soroush

1. **`recordVersionNow` never throws and never blocks a save.** A version that fails to record is a
   silent gap in a history. The alternative — failing the save — means somebody retypes a paragraph
   because bookkeeping had a bad moment. I took the gap. If a missing history entry should instead
   be surfaced somewhere, EPIC-041 is where it would go.
2. **`suite_runs.version` is nullable and stays nullable.** Every run predating this epic has none,
   and backfilling would be inventing a historical fact. EPIC-041's UI will therefore meet runs with
   no version and must say something honest about them.
3. **50 is the default page size for `versionsForPrompt` and nothing prunes.** At 2 MiB per 50
   versions a heavily-edited prompt grows without bound. No pruning is built, deliberately — deleting
   somebody's history is a product decision, not an implementation detail.
