<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-041 report — the Versions page: history, semantic diff, restore, A/B

Date: 2026-09-16 · Branch `epic/041-versions-page` · Stage 4's second epic

EPIC-040 made a version a frozen thing every run points at and rendered none of it. There is now a
page: the history, what one version changed, an older one put back without losing the one you were
on, and two versions run against the same inputs.

---

## 1. The question this epic existed to answer, and the answer

**Where does an A/B comparison show its answer?**

The obvious build is a third page — pick two versions, run both, land on a side-by-side results
screen. It is the most expensive thing in the epic and it duplicates two surfaces that already
exist: `runs/[runId]` renders results by check with attribution, and the version list already has to
show a pass rate per version.

**What was built instead:**

| | |
|---|---|
| the runs | two **ordinary** `suite_runs` rows sharing one `comparison` id, each pinned to its own version |
| what each sends | its own version's frozen `compiledText` and `compiledHash` — never a recompile |
| where the answer appears | **the version list's pass-rate column**, two rows side by side |
| where the link is legible | the run history row and the run detail page, each naming the other as a link |

**What this gives up, stated here rather than discovered later.** There is no single screen showing
both runs' per-check results next to each other; a person compares by opening two run pages. If that
turns out to be what people want, it is an epic, not a corner of this one.

**Why the list is the right surface.** It keeps working for two versions compared weeks apart, not
only for a pair that happened to be run together — which is the more common shape of the question
"is this better than what I had".

## 2. Restore never deletes, and the order is the whole of it

`docs/roadmap.md`'s Review line for this epic is three words. Read only as "does not delete a version
row" it is free — nothing ever did. It has to mean more, because a naive restore **does** destroy
something: the open `Draft vN` is unpinned, so rule 2 rewrites it in place, and everything typed
since the last run would have no other home. Somebody restoring "just to look" would silently lose an
afternoon.

So `restoreVersionAction` is four steps and the second is the point:

```
recordVersionNow()   # the open draft catches up with the canvas
pinVersion()         # ← frozen, so it survives as its own version
applySnapshot()      # the canvas becomes the older blok set
recordVersionNow()   # mints Draft v(N+1) holding the restored content
```

The history gains rows and loses none, in every case. Underneath, `applySnapshot` never issues a
`DELETE`: a blok the restored version did not have is **soft**-deleted through the same door
`deleteBlok` uses, and a blok it did have comes back **under its own id**.

**The id matters more than it looks.** `diff()` matches on blok id, so a restore that re-inserted the
same text under a fresh id would make every future diff report a removal and an addition where a
person restored something — breaking the one property the whole diff design rests on.

## 3. The defect the drive found, which belongs to EPIC-040

**An `expected` blok emits no text.** `compile/emits-text.ts` says so in as many words: it becomes a
*check*, and a prompt of nothing but expected bloks compiles to `""` plus a list of checks. So adding,
editing or removing one leaves `compiledText` byte-identical — and EPIC-040's rule 1, deduping on
`compiledHash`, read that as "nothing changed" and **wrote nothing at all.**

Three things then go wrong, and the first two are why this is a defect rather than a curiosity:

1. **Restore would silently drop the blok**, because it writes the snapshot back and the snapshot
   never recorded it. Data loss through the one feature whose review line is "restore never deletes".
2. **A/B would run with fewer checks than the prompt has**, because a comparison run's checks are
   derived from the version's snapshot. The run verifies less than the person believes and the
   surface says "nothing was verified" for a prompt full of rules.
3. **`suite_runs.version` would name a version that does not describe what ran.** The run's own frozen
   `suite_checks` are right — they come from the live compile — but the version beside them is not a
   faithful snapshot of the blok set that produced them.

**The fix.** `prompt_versions.snapshot_hash` is now the dedupe key. `compiled_hash` keeps its own job,
which is being comparable with `suite_runs.prompt_hash`. The digest is taken on the way **in**, from
the object `snapshot()` just built — nothing ever compares a `jsonb` round trip, which matters
because `jsonb` does not preserve key order and a stringify-compare would be unreliable even for two
identical snapshots. Nullable, because rows written before it existed have none and null equals
nothing: the first save after this rewrites or mints instead of deduping against a key nobody
recorded. Wrong in the safe direction — an extra version, never a missing one.

**Proved rather than asserted.** The new test was run against the old rule 1 first and failed with
`expected 'unchanged' not to be 'unchanged'`. A second test is the other half: an identical blok set
must still write nothing, or the fix turns every debounce tick back into a row.

**How it was found.** Two drive assertions failed — the A/B one looked for the expected blok's words
in `prompt_text`, the restore one in `compiled_text`. Both were my assertions being wrong about where
an expected blok lives. Chasing *why* they were wrong is what surfaced the defect underneath, and it
is the clearest argument this project has for the browser drive: no unit test in either package could
see it, because each package was self-consistent.

## 4. A second defect, found by writing the test rather than by running it

`bloks.id` is a **global** primary key, not one scoped per prompt. A snapshot naming an id that
belongs to a different prompt therefore cannot be applied — the insert violates `bloks_pkey`.

Three options and two are worse than refusing. Minting a fresh id silently breaks identity, which is
the property `diff()` depends on; skipping the blok produces a prompt the person never had, quietly.
So `BlokBelongsElsewhereError` refuses the **whole** restore, checked before anything is written so
the failure is one named error rather than a constraint violation from whichever insert ran first.

Unreachable with minted ids, which are random. Reachable with the decompiler's content-derived
`blok_` ids, where two prompts holding identical text hold identical ids. **No import path mints
those into `bloks` today**; this is the guard for the day one does.

## 5. Colour: the pass rate is not painted

`CLAUDE.md` rule 10 reserves green, red and amber for pass, fail and drift. The mockup paints a pass
rate **red** at 81.7% and **amber** at 88.0%, and both are wrong here: amber would claim drift, and
red would claim a failure against a bar nobody has set. A pass rate is a measurement, not a verdict.

So nothing on this page carries any of the three, the diff verbs included — `added` and `removed` are
weight and a strike-through, not green and red. The drive asserts it by reading every computed colour
on the page and comparing against the three tokens rendered as `rgb()`: **none present**.

The rate always arrives with its counts — `"16 of 17 checks passed — 94%"` — because "94%" of what is
the question a bare percentage always raises. Four situations are kept apart rather than collapsed:

| | words |
|---|---|
| nothing has been run | `No run yet.` |
| a run is in flight | `A run is in flight.` |
| results exist, none gradable | `Nothing could be graded — 4 results, none of them a pass or a fail.` |
| a real rate | `3 of 4 checks passed — 75%, and 2 could not be graded.` |

`0%` never appears for the third, because EPIC-030 made `not_graded` a third outcome that is never
folded into a fail.

## 6. Vocabulary: every version is `Draft vN`

ADR-003: `Draft vN` unpublished, `Live vN` published. **Nothing in this product has ever been
published**, so a pinned version is still a Draft — pinning freezes what a version *is*, it does not
publish it. Never "current", "latest" or "unsaved".

The pinned/open distinction is shown as a **sentence** rather than a second state name beside
Draft/Live: *"Your edits land here until a run pins it"* and *"Frozen — something points at this one,
so it can never change."* A test asserts neither sentence contains any of the three forbidden words.

## 7. Acceptance criteria

- [x] **`/app/pr/[promptId]/versions` exists**, owner-scoped, **404 not 403** for somebody else's
      prompt — `versions-page.spec.ts`, "another account's prompt is a 404, never a 403", asserting
      `response.status() === 404` over real HTTP with a real second session.
- [x] **The list shows every version as `Draft vN`** with note, time and pass rate; a version nothing
      has run says so in words — `view.test.ts` (6 cases), `versions-page.spec.ts` "lists the history
      as Draft vN" and "says a version has had no run rather than showing it as zero", drive §8.
- [x] **The diff panel renders `diff(a, b)`** with the compiled byte delta, defaulting to the two
      newest — `view.test.ts` `diffLines` (7 cases over real `snapshot()` output), e2e, drive.
- [x] **A moved blok reads as moved** — asserted at three levels: `packages/core`'s own fixtures,
      `view.test.ts` against the rendered line, and end to end through the canvas's own **Move up**
      button in both the e2e and the drive (`added,moved,moved` — never `removed`).
- [x] **A prompt with one version renders without a diff, saying why** — e2e "a prompt with one
      version says so instead of rendering an empty diff", and drive screenshot 01.
- [x] **Restore puts the older blok set back** — text, kind, order and hand edits. `restore.test.ts`
      (9 cases), e2e "restore puts the canvas back", drive §8.
- [x] **Restore never deletes** — the version count only ever grows, the pre-restore work survives
      **pinned**, and the removed blok's row is soft-deleted. All three asserted in the drive and in
      `restore.test.ts`.
- [x] **A/B creates two linked runs** — one `comparison`, two versions, two different frozen prompts.
      `restore.test.ts`'s comparison suite, e2e, and the drive reading the rows back.
- [x] **A run that predates versions says something honest** — `runVersionWords`, `view.test.ts`:
      *"This run predates version history."* EPIC-040 §11.2's inherited obligation.
- [x] **Vocabulary** — `pnpm forbidden-words` PASS; §6.
- [x] **Colour** — §5, asserted by the drive against the rendered tokens.
- [x] **Keyboard and touch** — every control is a native `button`, `a`, `select` or `input`; 44px
      minimums in `versions.css`; no horizontal overflow at 390px and the grid collapses to one
      column, both asserted in the drive with screenshots 08.
- [x] **Driven by hand against the built app** — §8.
- [x] **`node scripts/gate-run.mjs` green on the commit before it merged** — §9.

## 8. The drive, against the built app

`scripts/drive-epic-041.mjs`, committed so it can be re-run rather than believed. Nine screenshots in
`docs/epics/reports/screenshots/EPIC-041/`, at 1440px, at 390px, and in dark.

Unlike EPIC-040's, this epic renders a whole page, so this **is** a drive of a new screen. Every
state was visited on purpose, including the two easiest to skip — one version and therefore no diff,
and a version nothing has run — because a first-run state that throws is a defect nobody sees until
the day somebody signs up.

```
PASS  the built app is styled — rgb(239, 237, 230), Archivo
PASS  a brand-new prompt has exactly one version, listed
PASS  it is named Draft v1, per ADR-003
PASS  a version nothing has run says so rather than showing 0%
PASS  one version renders a sentence rather than an empty or broken diff
PASS  the run detail says which version it ran — Ran Draft v1
PASS  editing after a run opened Draft v2
PASS  the history lists both, newest first — Draft v2,Draft v1
PASS  the diff panel names the pair it is showing — Draft v1 → Draft v2
PASS  the diff reports the added blok / the moved blok reads as moved
PASS  and never as removed plus added — the roadmap's named test
PASS  the compiled byte delta is shown — Compiled 103 → 103 bytes · no change
PASS  no pass, fail or drift colour appears on the page (rule 10) — none
PASS  a note written here appears in the history
PASS  A/B created two runs / they share one comparison / each pinned to a different version
PASS  each run sent its own version's frozen prompt, not one recompile of the current canvas
PASS  the run history names the version and the A/B — Ran Draft v2 · one half of an A/B
PASS  restore added to the history and removed nothing — 2 → 3
PASS  the work that was open when restore was pressed is still in the history, pinned
PASS  an expected blok reaches the version history, though it emits no text
PASS  the canvas is back to the two bloks Draft v1 had
PASS  and its row is soft-deleted, not deleted — restore never deletes
PASS  no horizontal overflow at 390px / the two columns become one on a phone
PASS  the dark screenshot is actually dark, not a mid-transition blend — rgb(11, 11, 11)
```

**Three things the drive got wrong about itself before it got them right**, all worth recording:

1. **Two assertions looked for an expected blok's words in compiled text**, where they can never
   appear. Chasing why is §3.
2. **The "dark theme" screenshot was a mid-transition blend.** `base.css` transitions background over
   0.3s, so flipping `data-theme` and shooting immediately produced a light page with text that read
   as a contrast failure that does not exist. It now sets the theme cookie and lets the server render
   dark — and **asserts the ground is actually dark before believing the picture**, because a
   screenshot that lies is worse than no screenshot.
3. **An old `next start` survived the kill and served a wiped `.next`**, and the page came back
   unstyled. Caught by the drive's own "the built app is styled" check, which is the check that
   exists because of the twenty-epic outage. The port is now confirmed free before restarting.

**What this local drive does not cover**, stated so it does not read as a deployed one: the image
build, the Coolify environment, Traefik, and migrations against the real database. Those wait for
Soroush's next push. `origin/main` is behind local `main`, so **staging is not serving this code and
no staging URL is evidence about it.**

## 9. Verification

```
pnpm test        # 8/8 PASS, every package reporting, database from the environment
pnpm typecheck   # 8/8 PASS
pnpm lint        # 11/11 PASS, including dependency-cruiser, turbo boundaries, forbidden words
pnpm e2e         # 219 passed, 4 skipped (Linux-only visual baselines)
node scripts/gate-run.mjs        # 16 steps, all passed, 8m26s, on 0fe43fe
node scripts/drive-epic-041.mjs  # with the built app on :3000 — the script header has the commands
```

**What the green gate does not cover**, printed by the run and repeated because it is part of the
result:

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and skip here. This epic adds a whole new stylesheet and a new route — **that is precisely what
   those baselines would catch and they did not run**, which is a real gap rather than a footnote.
   They cover the landing page and `/dev/ui`, neither of which this epic touches, so the exposure is
   a token or reset change leaking sideways; nothing here edits a token.
2. **The runner is slower.** A test that only fails under load passes here.

## 10. A flaky `pnpm e2e` that was a mechanism, not an environment

`activation.spec.ts` failed once during this epic, timing out waiting for a run to finish. It would
have been easy to call environmental. It was not.

**The mechanism.** Several specs trigger a run **without** starting a worker — `versions.spec.ts` and
this epic's `versions-page.spec.ts` both do, deliberately, because everything they assert happens at
trigger time. Each leaves a `run-suite` job on the queue, and each spec's `afterAll` then deletes its
test user, cascading the `suite_runs` row away and leaving the job pointing at nothing. Those jobs
survive the run — `worker-process.ts` says so in as many words: *"pg-boss survives an ungraceful exit
by design — an in-flight job is picked up by the next worker to start."* The next worker to start is
`activation.spec.ts`, alphabetically ahead of every other spec, and it drains the previous run's
backlog inside its own 60-second budget.

**Three observations agreeing:** it failed on the run after one that left jobs behind; it passed in
isolation; it passed again on the next full run once the queue had drained.

**The fix is in the harness, not in the test.** `apps/web/e2e/global-setup.ts` removes `run-suite`
jobs whose `suiteRunId` no longer resolves to a row, before anything starts. A job whose run still
exists is real work and is left alone. It removed **12** on its first run and announces what it
removed, because a cleanup that runs in silence cannot be told from one that is not running.

## 11. Open questions for Soroush

1. **Both sides of the compared pair are ink-inverted in the history list.** With two versions that
   means the whole list is inverted. It is truthful — both rows are what the diff panel is showing,
   and the heading beside it says so — but if only the right-hand side should be marked, that is a
   one-line change and a ruling I did not want to make silently.
2. **A version that fails to record is still a silent gap**, inherited from EPIC-040 §11.1 and not
   closed here. `recordVersionNow` never throws; a missing history entry is invisible. This page is
   where a signal would live if one is owed, and I did not invent one, because nothing can currently
   detect the gap — only a record of the attempt could, and that is a design decision.
3. **Nothing prunes.** The page shows the 50 most recent and says so when there are more:
   *"Showing the 50 most recent. Nothing removes older ones; they are still stored."* At ~2 MiB per
   50 versions a heavily-edited prompt grows without bound. Deleting somebody's history is still a
   product decision, not an implementation detail.
4. **`restoreVersionAction` pins the open draft**, which means pressing Restore changes what the next
   save does — it mints instead of rewriting. That is correct and is the same rule a run follows, but
   it is a state change the person did not ask for by name, and the page does not say it will happen.
5. **A/B on an unpinned version pins it**, for the same reason and with the same caveat.

## 12. New dependencies

**None.**

## 13. Migrations

| | |
|---|---|
| `0011_smiling_luke_cage.sql` | `suite_runs.comparison` — nullable text, no backfill |
| `0012_watery_firestar.sql` | `prompt_versions.snapshot_hash` — nullable text, no backfill (§3) |

Neither has run anywhere but locally: nothing is pushed, so nothing is deployed.
