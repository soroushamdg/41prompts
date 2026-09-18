<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Notes for EPIC-021b — carried out of EPIC-020

Two things EPIC-020 found and deliberately did not solve, because both are decisions about the
compiled pane rather than about the model. **Written down so EPIC-021b starts from them instead of
rediscovering them**, at which point the second one in particular is expensive: it is a data-loss bug
that only shows up once somebody has done real work in the pane.

Soroush's ruling, 2026-09-12: these belong in EPIC-021b's scope as named requirements.

---

## 1. Adding a blok to a prompt that has hand-edited spans

**The problem.** `compile()` is a *fresh* compile — it always returns fully `compiled` spans, so
calling it again **discards every hand edit**. `updateFromBlok()` only ever touches a span that
already exists. So when a user adds a blok to a prompt they have edited by hand, neither function
does the right thing: one throws away their typing, the other cannot make a span that is not there.

This is not an oversight in the model. Decision 2 makes the blok set the source of truth and decision
8 says there is no merge, and both are right — a hand-edited span is an exception the model *records*,
never a second truth to be reconciled. The gap is that nothing yet says what the **pane** does at that
moment, and it is the pane's call.

It will be hit the first time somebody adds a card to a prompt they have edited. That is not an edge
case; it is a Tuesday.

**Candidate A — `compile(bloks, { keep: previous })`.** The option carries hand-edited spans forward
by blok id: any blok whose span was `edited by hand` in `previous` keeps that span's text, its state,
and **the hash it kept**, so `drift()` still reports both facts correctly afterwards. Everything else
recompiles.

- *For:* one pure function, no state in the pane, and the retained hash means "the blok changed since
  you edited this" survives a recompile — which is exactly the case this is about.
- *Against:* `compile` stops being a pure function of the blok set alone. It is still deterministic
  and still takes all its input as arguments, but "compile the bloks" becomes "compile the bloks,
  given what was there before", and EPIC-050's artifact builder has to decide which it publishes.

**Candidate B — the pane replays its edits.** `compile()` stays as it is; the pane holds the list of
hand edits it has made and calls `editSpan` for each after a recompile.

- *For:* `packages/core` does not change at all, and the pane owns the thing the pane decided.
- *Against:* the replay list is state that can disagree with the compiled prompt — the exact failure
  decision 9 avoids for drift — and an edit replayed onto a blok that has since changed needs a rule
  of its own, which is a merge by another name.

**A recommendation, not a decision:** A, because the retained hash is already the mechanism that makes
the two facts distinguishable and B has to reinvent it in the pane. But this is EPIC-021b's to make.

**Whichever wins, it needs a test that a hand edit survives adding an unrelated blok**, because the
failure is silent — the pane recompiles, the text looks right, and the sentence somebody wrote is
gone.

---

## 2. The mockup's banner can express one state; the model distinguishes two

**The mockup draws one line** (`docs/design/41prompts-full-mockup.html`, editor page):

```
Blok 4 edited by hand · compiler released this block · Reconcile
```

That says a span was taken by hand. It has **no way to say the blok has changed since** — and those
are different facts with different consequences for the reader, which is the distinction EPIC-020 was
built around. `drift()` reports `textDiffersFromBlok`, `blokChangedSinceSpan` and the span's `state`,
and the pane needs at least two banner states off them:

| state | differs | changed | what the banner has to say |
|---|---|---|---|
| edited by hand | yes | **no** | "Edited by hand." Nothing is out of date; this is a choice somebody made. |
| edited by hand | yes | **yes** | "Edited by hand, and the blok has changed since." Update from blok replaces what they typed — they need to know that before pressing it. |
| compiled | yes | yes | "Out of date." Nobody typed here; Update from blok is free. |
| compiled | **no** | **yes** | Nothing visible. The blok's *kind* changed and the text did not; the cached span is stale but the reader has nothing to do. |

The second row is the one the mockup cannot draw, and it is the one where pressing "Update from blok"
destroys somebody's work. **The fourth row is a deliberate silence**, not a missing state — surfacing
it would be a banner about nothing the reader can act on.

**Also pre-ADR-003 in the mockup, and not to be copied:** "Reconcile" is now **Update from blok**,
"block" is **blok**, and the `drifted` badge on `b4` is **edited by hand**. `docs/design/README.md`
already says the ADR wins where the two disagree.

---

## Where the detail is

`packages/core/src/compile/README.md` — the two representations, who owns the separator, and the
four-cell table. `docs/epics/reports/EPIC-020-report.md` §1 and §8. `compile/drift.ts`'s own doc
comment carries the worked case for each cell.
