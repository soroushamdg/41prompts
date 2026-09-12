<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-021b report — The compiled pane

Date: 2026-09-12 · Branch `epic/021b-compiled-pane`

---

## 1. The four state sentences

> *"Write the four state sentences before building anything and put them in the report; I will rule
> on the wording. If two come out nearly identical, say so."*

Written first, in commit `31f7de5`'s successor, before any pane code existed.

### The four

| # | `state` | differs | changed | badge | the sentence |
|---|---|---|---|---|---|
| 1 | compiled | no | no | — | *(nothing)* |
| 2 | edited by hand | yes | **no** | `edited by hand` | **You wrote this span. Update from blok replaces it with what the blok says.** |
| 3 | edited by hand | yes | **yes** | `edited by hand · blok changed` | **You wrote this span, and its blok has changed since. Update from blok replaces it with wording you have not seen.** |
| 4 | compiled | yes | **yes** | `out of date` | **This span is what its blok said before it changed. Update from blok brings it up to date and loses nothing.** |

Each sentence ends by saying **what the button does to you**, because that is the only thing the
reader is actually deciding. The states differ in consequence, not just in fact.

### On whether 2 and 3 are too close — asked for, and answered honestly

They share a subject ("You wrote this span") because **that half is the same fact**, and saying it
differently would be a distinction where there is none. The second clause is where they part.

**The distinction is real, and here is the sharpest form of it.** In both, pressing *Update from
blok* destroys writing — that is not the difference. The difference is what you get back:

- **State 2:** what you get back is *exactly what you saw before you started typing*. You already
  know what you are trading for.
- **State 3:** what you get back is **something you have never seen** — the blok moved while your
  edit sat there. You should look at the card before pressing, and in state 2 you need not.

So the honest summary is: **the states are distinct but the gap is narrow, and it is narrow in a
specific way.** Same action, same destruction, different *result*. If that turns out to be too fine
to be worth two sentences, the fallback is to merge 2 and 3 into "You wrote this span" and add the
blok-changed half as a second line only when it is true — which is nearly what these are, and is one
edit away. Recorded now rather than discovered later.

### A fifth cell that is deliberately silent

The model has **five** reachable cells, not four. The one the table above omits:

| `state` | differs | changed | |
|---|---|---|---|
| compiled | **no** | **yes** | the blok's *kind* changed and its text did not |

The span's hash is stale; its text is right. **It renders exactly like state 1 and says nothing**,
because there is nothing the reader can do about it and nothing they would lose by ignoring it. That
is a deliberate silence, not a missing sentence — `docs/epics/notes-EPIC-021b.md` §2 called it the
same way, and this is the one place the pane knowingly shows fewer states than the model holds.

It does mean the criterion "a test fails if two states produce the same text" is satisfied for the
four in the table and *deliberately violated* by this fifth cell, which produces the same output as
state 1. The test asserts the four are distinct and asserts this fifth one is silent on purpose.

### Colour

**Amber ⟺ `blokChangedSinceSpan`.** States 3 and 4 carry it; state 2 must not, because a hand edit
whose blok has not moved is not drift (decision 4, and rule 10). No state is carried by colour alone
— every one of them has the badge and the sentence above.
