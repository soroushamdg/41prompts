<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-024 session — 2026-09-20

Second epic of the mockup-parity programme, same session as EPIC-023. `main` carries EPIC-023 as
`5575a7c`; this ran on `epic/024-page-composition`.

## The thing that paid for itself before any code

**Reading the code the epic describes, before planning against it.** Two of the eight scope items
were already built — blok kind colour (EPIC-021a decision 6) and the drift banner's wording — and
the stale artefact was `docs/design/README.md`, not the product. Twenty minutes of reading against
however long rebuilding a shipped palette badly would have taken, plus a correction to the spec
that the next reader now gets for free.

It happened because EPIC-023's survey had already taught the same lesson twice: the epic files I
wrote at the start of the session were written from the mockup and the roadmap, not from the code.

## Decisions taken while building

1. **Every project-card number is derived and absent rather than zero.** Report §3.1. The sharpest
   part is that "Pass" for a *project* is not a quantity that exists, so it is defined as the newest
   finished run and the definition is written down where somebody will disagree with it.
2. **Characters, not tokens, on the compiled pane.** §3.2 — the only estimator in the repository
   calls itself crude in its own comment, and `apps/web` cannot import it anyway.
3. **A card may only collapse when its text is on the server.** §3.3. This is the one decision that
   could have lost somebody's writing, and it was made before the component was touched.
4. **The controls stayed a sibling of the card.** §3.4 — a second labelled group inside a
   `role="group"` whose body is a textarea is the `nested-interactive` shape `blok-card.tsx`
   refuses. I tried the restructure first, produced unbalanced JSX, and reverted rather than
   patching forward.

## What took longer than expected

**Two overlapping Playwright runs, twice.** Once producing fifteen `auth` failures at ~136ms each,
once producing `ERR_CONNECTION_REFUSED` and three "failed" autosaves. Both were one server on port
3210 being shared, and the second time a stale background task was reaped and took the server with
it mid-run.

The cost was maybe forty minutes and two near-misreadings of a clean product as broken.

## The lesson worth keeping

**A failure's shape tells you whether to believe it, before its message does.**

Fifteen specs failing in 136ms each is not fifteen regressions; sign-in does not break because a
blok card got shorter. Three autosaves "failing" in a run where the page also would not load is a
server, not a save path. Both times the *message* was plausible and the *shape* was not, and both
times I started reading the message first.

The same shape test is what made §4.4 obvious in the other direction: when the drive said a card was
165px against my `< 160`, the product was fine and the number was mine. An assertion I wrote and
then want to move is an assertion that was never measuring anything — so it was replaced with a
self-relative one (a card at rest against the same card open) that cannot be moved to fit.

And §4.1's corollary: **measuring in the wrong direction returns a clean answer.** Walking
`text-align` upward from `.compiled-text` reported `start` at every level, which reads as proof that
nothing is centring the text. The `<button>` doing it was one node down.

## Open at the end of the session

`gates.mjs ci`; the full e2e number; the Linux visual baselines. Report §8 has all four, with what
each would take.
