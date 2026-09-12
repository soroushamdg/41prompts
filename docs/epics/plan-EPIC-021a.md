<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-021a: Projects, prompts, and the blok canvas

Read `docs/epics/CURRENT.md` (mirror of `docs/epics/EPIC-021a-canvas.md`) first. This plan says how,
and names the three places it extends a decision rather than following it literally.

---

## 0. Decision 5 first, and it is built structurally rather than guarded

> *"This is the first epic where the product holds the only copy of something a person wrote. Build
> decision 5 first and write its test before the feature. That failure is silent, and it is the only
> one in this epic that loses work rather than inconveniencing someone."*

**Order of work, as commit boundaries so the history is the evidence:**

1. `packages/core`: `compile(bloks, { keep })`, **and its test, before the option exists**.
2. `packages/db`: the schema, including where a hand edit lives.
3. The failing end-to-end version of the named test, against the real server action.
4. Then the feature: the canvas, autosave, reorder, delete, undo.

### Candidate A, with one refinement — and why the refinement is the real safety

`notes-EPIC-021b.md` recommends **candidate A**, and A it is. B keeps a replay list in the pane that
can disagree with the compiled prompt, which is the failure decision 9 of EPIC-020 avoids for drift;
reinventing it here would be doing knowingly what that epic refused to do accidentally.

**The refinement: `keep` is a `Map<blokId, { text, hash }>`, not a whole previous `Compiled`.**

- It is **serialisable**, so the same value survives a page load. A `Compiled` is derived state that
  a server action would have to rebuild before it could carry anything forward.
- It carries exactly the two things a hand edit *is* — what the person typed, and which version of
  the blok they were looking at — and nothing that can go stale independently.
- `compile()` stays a pure function of its arguments. The note's objection to A is that "compile the
  bloks" becomes "compile the bloks, given what was there before"; with a map that is honest and
  narrow, and `compile(bloks)` with no option behaves exactly as it does today.

### Where a hand edit lives, which is the part that makes the failure impossible

**On the blok row: `edited_text` (nullable) and `edited_from_hash` (nullable).**

EPIC-020's one-span-per-blok invariant means a hand edit belongs to exactly one blok. Storing it
there rather than in a compiled blob on the prompt is what turns decision 5 from *a rule adding a
blok must remember to honour* into *a thing adding a blok cannot touch*: inserting a row into `bloks`
does not write to any other row, so no other blok's `edited_text` can be lost by it.

**That is an extension of decision 1**, which lists a blok row as "id, prompt id, kind, verbatim text,
order, timestamps". It adds two columns and removes nothing. Flagged here and in the report rather
than done quietly, because decision 5 is explicitly the epic's highest-risk requirement and this is
the shape of its answer.

### The named test, written before the feature

`a hand edit survives adding an unrelated blok`, at two levels:

- **In core**, over the pure function: compile, `editSpan` one span, compile again with `keep`, assert
  the edited span keeps its text, its `"edited by hand"` state and **the hash it kept** — so `drift()`
  still reports both facts afterwards. Plus the generated-input version over seeded blok sets.
- **In the web app**, over the real server action: create a prompt with bloks, write a hand edit, call
  `addBlokAction`, re-read, assert the hand edit is byte-identical. This is the one that would have
  caught the real bug, because the real bug is in the write path, not in the maths.

---

## 1. Data model (`packages/db`)

`projects` already exists (EPIC-002) with `id`, `owner`, `name`, `slug`, `createdAt`, `deletedAt`.
Two new tables:

```
prompts   id pr_+8hex · project → projects.id cascade · name · createdAt · updatedAt · deletedAt
bloks     id · prompt → prompts.id cascade · kind · text · rank · editedText · editedFromHash
          · createdAt · updatedAt · deletedAt
```

- **`deletedAt` on `bloks`** is decision 8's undo. A blok is someone's writing, so delete is a soft
  delete and undo is clearing a column, not reconstructing a row from memory. "Undoable for the
  length of the session" then falls out of the data rather than out of a client-side stack that a
  reload would drop.
- **Blok ids.** Decision 1 says "the content-derived ids EPIC-011a already produces". Those are right
  for a decompile and **wrong for a row somebody edits** — EPIC-020 settled exactly this for
  `PromptBlok.id`: a content-derived id changes when the text does, which orphans the row's history,
  its hand edit and its rank on every keystroke. New rows get `blok_` + 16 hex, minted once. A blok
  *imported* from a decompile keeps the decompiler's id as its first value, which is what decision 1
  is reaching for, and is then never recomputed. **Second extension, flagged.**
- **`kind`** is checked against `BLOK_KINDS` from `packages/core` at the boundary, not a database enum
  — ADR-003 forbids that word, and a `CHECK` constraint needs a migration every time the list moves.

### Ordering (criterion 3)

**Fractional index over a lexicographic rank string**, not an integer.

`rank` is a short base-62 string ordered lexicographically; inserting between two cards mints a string
strictly between their ranks. **Reordering one card writes exactly one row** — the criterion — where
integer positions rewrite every row after the moved one.

The rebalance, documented because the criterion asks: repeated insertion between two adjacent keys
grows the string by roughly one character each time. When any key exceeds `RANK_MAX_LENGTH` (32), the
whole prompt's ranks are rewritten evenly in one transaction. That is the only operation that touches
more than one row, it is O(bloks), and at 60 bloks it is one statement. A test drives 200 successive
same-slot insertions and asserts a rebalance happened, stayed ordered, and left the bloks in the same
sequence — the case that would otherwise only appear in production after a month of dragging.

### Owner scoping (criterion 2)

One helper, `promptForOwner(db, promptId, owner)`, joining `prompts → projects` and filtering on
`projects.owner`. **Every read and write goes through it.** A miss returns `undefined` and the route
calls `notFound()` — a **404, not a 403**, so the id's existence is not disclosed. Tested from the
other user's side, not by unit-testing the helper.

---

## 2. `apps/web`

Routes, per decision 10: `/app/projects`, `/app/p/<projectId>`, `/app/pr/<promptId>`. All behind
`requireSession`, all `noindex`, all on the app host.

**Server actions, not REST** (decision 9). Each one: resolve the session, scope by owner, validate,
write. Blok text is stored **byte for byte** — no trim, no CRLF conversion, no normalisation. EPIC-013
learned this the hard way and EPIC-014's `decompiles.source` comment already says why.

### Autosave (decision 4)

Debounced write on the blok textarea. The card states in **words**: `Saved`, `Saving…`, `Not saved`.
Never colour alone, and green is reserved regardless (rule 10).

**The failure path is the one that matters and gets its own test:** a rejected write leaves the typed
text in the field, shows the message, and **never** replaces the field with a stale server value. The
server response is not written back into a field the user may still be typing in.

### Reorder, by keyboard as well as pointer (criterion 10, rule 12)

Each card is a reorder handle with arrow-key movement, `aria-describedby` instructions, and a
`aria-live="polite"` region announcing "Moved to position 3 of 7" after each move. Pointer drag is
additive; **the keyboard path is the one the test drives**, because a drag-only implementation fails
rule 12 and passes a careless review.

### Category colour (decision 6, the debt from EPIC-020)

Six per-kind colours in `packages/ui`'s token layer, applied **only** on `:hover`, `:focus-visible`
and `[data-selected]`. Never at rest. Two guards:

- a test that a card at rest carries no category colour, asserted on the rendered class/attribute
  surface rather than on a screenshot;
- the existing `/app` grep for green, red and amber, which must stay clean — the six are drawn from
  the ink and accent ramps, not from `--pass` / `--fail` / `--warn`.

The persistent distinction stays the glyph and the kind's name as text, which EPIC-013 shipped and
which a colour must not replace: `BlokKindGlyph`'s own comment says a shape nobody has been taught is
not an affordance.

---

## 3. Tests

| criterion | how |
|---|---|
| full round trip, persists across reload | one e2e, magic-link signed in, following `auth.spec.ts`'s helper |
| another user gets 404 | e2e: two users, second requests the first's prompt id |
| reorder writes one row | server-action test counting statements against a query log |
| autosave, and a failed write | two tests, the second with the write rejected |
| **hand edit survives an added blok** | **two: core (pure) and the server action** |
| byte-for-byte storage | four fixtures — CRLF, tabs, astral emoji, RTL — round-tripped through the database |
| colour only on interaction | render test on the rest state |
| no green/red/amber on `/app` | grep over the route's rendered tokens |
| 60 bloks, no interaction over 100 ms | timing, reported with headroom, per `PROCESS.md`'s note on absolute budgets |
| axe, keyboard, 44px, reduced motion | four named tests |

---

## 4. What would make this a BLOCKER

Nothing identified. The three extensions above (two blok columns, minted blok ids, and building the
hand-edit store before the pane that writes to it) are all additive, all flagged, and none contradicts
a decision. If the 100 ms criterion cannot be met honestly at 60 bloks, that is a report finding with
the measurement, not a widened bar.
