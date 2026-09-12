<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-021a report — Projects, prompts, and the blok canvas

Date: 2026-09-12 · Branch `epic/021a-canvas`

---

## 1. Decision 5, built first and built structurally

> *"This is the first epic where the product holds the only copy of something a person wrote. Build
> decision 5 first and write its test before the feature. That failure is silent, and it is the only
> one in this epic that loses work rather than inconveniencing someone."*

**Candidate A, refined, and then given a home that makes the failure impossible rather than caught.**

### The refinement to candidate A

`notes-EPIC-021b.md` proposed `compile(bloks, { keep: previous })`. Shipped as
`compile(bloks, { keep })` where **`keep` is a `Map<blokId, { text, hash }>`**, not a whole previous
`Compiled`. Two reasons, both practical:

- It is **serialisable**, so the same value survives a page load and can be rebuilt from rows. A
  `Compiled` is derived state a server would have to reconstruct before it could carry anything.
- It carries exactly the two things a hand edit *is* — what the person typed, and which version of
  the blok they were looking at — and nothing that can go stale on its own. A `Compiled` holds
  offsets and a text that mean nothing against a different blok set.

`compile(bloks)` with no `keep` is unchanged: a fresh compile, a pure function of the blok set alone.
That is what EPIC-050's artifact builder wants — it publishes what the bloks say, not an exception
somebody made in an editor. The note's objection to A was that "compile the bloks" becomes "compile
the bloks, given what was there before"; with a map that is narrow and explicit, and only when asked.

### Where the hand edit lives, which is the actual answer

**On the blok row: `edited_text` and `edited_from_hash`.**

EPIC-020's one-span-per-blok invariant means a hand edit belongs to exactly one blok. Putting it on
that blok's row means **inserting a row into `bloks` writes no other row**, so adding a blok cannot
reach another blok's hand edit. The failure has nowhere to live.

**This is worth stating as a general preference, because it is why this is the right shape: a bug
with nowhere to live beats a test that catches it.** A test has to keep being right as the code
around it changes; a structure that cannot express the bug does not. The alternative — a compiled
blob on the prompt, rewritten on every change — would have made every write a read-modify-write over
the whole prompt, which is exactly the shape that loses somebody's typing.

**Both tests kept anyway**, as ruled, and they do different jobs:

| | proves |
|---|---|
| `packages/core/src/compile/compile.test.ts` (7 cases) | the maths: what `keep` does to a compile |
| `packages/db/src/canvas.test.ts` (5 cases) | **the write path**, which is where a hand edit actually gets lost |

The database one is the one that would catch the real failure. The strongest of its cases asserts the
structural claim directly: **`adds a blok without updating any other row`** — it reads every row's
`updatedAt`, inserts a blok, and fails if any of them moved. If the insert ever becomes a wider
write, that test says so on the day it happens rather than the day somebody loses a paragraph.

**Written before the feature, and red first.** The seven core cases were committed failing on `keep`
not existing; the failure list is in the session log.

### Test names, for the criterion's evidence

```
a hand edit survives adding an unrelated blok > keeps the text, the state and the hash when a blok is added
                                              > still reports both drift facts correctly after the recompile
                                              > the new blok compiles normally, and every other span is untouched
                                              > survives deleting a different blok, and reordering, for the same reason
                                              > keeps nothing for a blok that is no longer in the set, rather than resurrecting it
                                              > ignores a kept entry for a blok that has become expected
                                              > holds over generated blok sets: an edit survives any one blok being added

the canvas, owner-scoped > a hand edit survives adding an unrelated blok > survives adding a blok
                                                                        > survives adding a blok in front of it
                                                                        > survives another blok's text being autosaved, deleted and restored
                                                                        > survives a reorder, including one that forces a rebalance
                                                                        > adds a blok without updating any other row
```

---

## 2. Ordering: fractional index, and the rebalance is driven

`rank` is a base-62 string ordered lexicographically. Inserting between two cards mints a key strictly
between theirs, so **reordering one card writes one row** — integer positions rewrite every row after
the moved one, and a float stops ordering *silently* after about fifty insertions into the same slot.

**The rebalance.** Repeated insertion into one gap grows the key by about one character per five
insertions (base 62 gives five halvings per digit). When any key passes `RANK_MAX_LENGTH` (32), the
prompt's ranks are rewritten evenly in one transaction — the only operation in the canvas that
touches more than one row, O(bloks), one statement at canvas sizes.

**It is driven in tests rather than waited for**, which was the reason given for asking:

- `rank.test.ts` → `stays strictly ordered over 200 insertions into the same slot, and grows`
- `canvas.test.ts` → `rebalances when keys grow too long, and the order survives it` — 220 real moves
  against the database until the rebalance actually fires, then asserts the order and that every key
  came back short.

A rebalance that first runs in production after a month of dragging is a rebalance nobody has run.

**One thing that had to be pinned: the collation.** Postgres compares `text` by the database
collation, and a locale-aware one can treat `a` and `A` as equal or order punctuation differently
from JavaScript's `<`. The canvas would then order one way in the browser and another in the
database, surfacing as cards silently swapping on reload. Every rank comparison uses `COLLATE "C"`,
the alphabet is chosen so byte order and JavaScript order agree, and two tests pin it from both
sides: `uses an alphabet whose JavaScript order is byte order`, and a database test inserting ranks
`"Z"` and `"a"` and asserting byte order wins.

---

## 3. Three defects the tests found, not review

Worth listing because each one is the kind this epic is supposed to be careful about.

1. **Undo could not restore anything added in the same session.** It looked the blok up in the
   component's initial props, so the row came back in the database and the card never reappeared —
   the person watched their writing vanish, then watched undo do nothing. Caught **because criterion
   1 is one test and not six**: split up, "delete works" and "undo works" would both have passed.
2. **"Saved" lingered across a new edit.** The status stayed on `Saved` while newer keystrokes were
   unwritten, so a test could assert `Saved` and be looking at the previous save. Fixed by dropping
   to `idle` on every keystroke — which is also simply true, and it is the exact lie that makes
   somebody close a tab early.
3. **The card was a `<button>` containing a `<textarea>`.** `nested-interactive`: axe flags it, and
   screen readers genuinely mishandle it — the textarea inside a button may not be announced at all.
   Found by this epic's own axe test. `BlokCard` gains `as="div"` for a card that *contains* controls
   rather than being one, and the keyboard reorder path moved onto the move buttons, which is what a
   keyboard user actually reaches.

---

## 4. Acceptance criteria

- [x] **Create, add four, reorder, edit, delete, undo; all persists across a reload.** Evidence: e2e
      `create, add, reorder, edit, delete, undo — and it all persists across a reload`.
- [x] **Another user gets 404.** Evidence: e2e `another user asking for the prompt by id gets 404, not
      403`, and `canvas.test.ts > owner scoping > does not resolve it for anybody else`. The refusal
      message is identical for "no such prompt" and "not yours".
- [x] **Reordering one card writes one row; the scheme and its rebalance documented.** Evidence: §2,
      `packages/db/src/rank.ts`, and `reads bloks in rank order, and a move writes one row`.
- [x] **Autosave: text survives a reload; a failed write shows a message and leaves the text.**
      Evidence: `autosave > text survives a reload, byte for byte` and `autosave > a failed write
      shows a message and leaves the typed text in the field` (server actions aborted at the network).
- [x] **A hand edit survives adding an unrelated blok.** Evidence and reasoning: §1.
- [x] **Blok text stored byte for byte.** Evidence: `round-trips %s unchanged` × 4 — CRLF, tabs with
      trailing space, an astral emoji, RTL with combining marks — through the real database, asserted
      both as a string and code-point by code-point.
- [x] **Category colour only on hover, focus or selection.** Evidence: `blok category colour appears
      only during interaction` × 4, which reads the rule out of the stylesheet rather than off a
      screenshot. Proved before being trusted: adding a rest-state rule turns it red.
- [x] **No green, red or amber on any `/app` route.** Evidence: grep over `canvas.css` and the route
      files; the six category hues are drawn from blue, indigo, violet, cyan-blue, magenta and clay,
      and all twelve (six kinds × two themes) clear the 3:1 UI tier at 6.99:1–9.24:1.
- [x] **60 bloks, no interaction over 100 ms.** Measured **click to painted frame, inside the page**:
      `first render 11 ms, reorder 16 ms click-to-paint (99 ms including Playwright's own click
      overhead)`. Both numbers logged. Driving it through Playwright's `.click()` measures
      Playwright's actionability and scroll-into-view as much as the app; `PROCESS.md` is blunt about
      budgets that end up measuring the runner. It was 157 ms before memoising the editor.
- [x] **Axe clean in both themes; keyboard reorder; 44px; reduced motion.** Evidence: `axe is clean on
      the canvas in the light/dark theme`, `reorders by keyboard alone, announcing the new position`,
      `every control on the canvas clears 44px on a phone`, `reduced motion shows the card's end state
      rather than skipping it`.
- [x] **Forbidden-word grep passes.** Clean over `packages/ui/src`, `apps/web/app`, `apps/web/lib`.
- [x] **`pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.** See §6.
- [ ] **Staging deploy and screenshots.** Not done in this PR, and it cannot be: staging tracks
      `main`, so the deploy happens when this merges. See §7 for what is left and why.
- [x] **Report and session log written; backlog updated.**

---

## 5. Decisions inside the epic's latitude

**Blok kind is validated at the boundary**, not by a database constraint. ADR-003 forbids that word,
and a `CHECK` would need a migration every time the six move. Reading back an unknown kind falls back
to `context` rather than throwing: `context` is the safe default for exactly this reason, and a canvas
that refuses to render because one row is odd is worse for the person whose writing is in it.

**Creating something navigates to it.** Also removed a race the e2e found — a `router.refresh()` can
render a list before the insert is visible to the next read.

**Delete is a soft delete** (decision 8), so undo is clearing a column rather than rebuilding
someone's writing from a client-side stack a reload would drop. Order comes back with it, because the
rank was never touched.

**Keyboard reorder is the implementation, not an accessory.** The move controls are real buttons
reached by Tab and activated by Enter, with arrow keys as an accelerator once focus is on one. The
live region announces "Moved to position 3 of 7" politely. A pointer drag would sit on top of this;
it is not built here and is not needed for the criterion.

---

## 6. Verify

```
pnpm test && pnpm typecheck && pnpm lint && pnpm compliance && pnpm binary-files
E2E_PORT=3100 pnpm e2e
```

Last run: **8/8 packages**, core 475, web 219, db 58, ui 83, worker 57, logger 11, sdk 2, cli 1.
**e2e: 133 passed.** Lint 451 files clean, forbidden-word grep clean, mirror dry-run OK, no binary
source file.

`.env` must be sourced and a local Postgres running (`docker start 41p-dev-postgres`, `pnpm
db:migrate`).

### Three core tests were failing on timeout, and this branch caused it

Under a full parallel `pnpm test`, `cluster.perf.test.ts`'s two throughput tests and
`detect.test.ts`'s 100-run determinism test failed at 5.5–7 s against vitest's 5-second default.

**Verified rather than assumed**, because `PROCESS.md` is explicit that "environmental" is a
hypothesis: three full parallel runs on this branch failed there, and two on the tree without it did
not. This epic's additions — a 220-move database rebalance, two more seeded loops in
`compile.test.ts` — are the extra contention.

They are given **explicit timeouts, not widened budgets**. Every assertion is unchanged; only how
long the harness waits before calling a test hung. `cluster.perf.test.ts`'s growth gate already
carried `{ timeout: 120_000 }` for the same reason. Three parallel runs clean afterwards.

---

## 7. Not done

1. **The staging deploy and its screenshots.** Staging deploys from `main` (EPIC-008: CI builds
   `:staging` on a push to main, Coolify pulls it, and `apps/web`'s entrypoint runs the migration
   before `next start`) — so it cannot happen from a branch. The sequence is: merge, let staging
   deploy, drive the canvas by hand at both viewports, and land the screenshots with this section
   filled in. **The criterion stays unticked until that is actually done**, not ticked on the
   intention.
2. **Pointer drag-and-drop.** The keyboard path is complete and is what rule 12 requires; a drag is
   additive and was not in scope.
3. **Importing a decompile into a project.** Out of scope by name; noted, not built. The blok-id
   amendment already provides for it — an imported blok keeps the decompiler's id as its first value.
4. **No compiled pane, span linking, drift display or update-from-blok.** EPIC-021b, and
   `notes-EPIC-021b.md` still holds its two carried requirements. The `keep` option and the two
   columns this epic added are what that epic will read.
