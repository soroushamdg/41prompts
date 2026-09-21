<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# No epic is in progress — EPIC-016d is planned and waiting on four answers

**Do not start building until Soroush has answered the four questions below.** Three of them decide
whether the site publishes something about the company that is not true; the fourth decides whether
a rule in `CLAUDE.md` changes. None of them is mine to assume, and "make it match the mockup" is not
an answer to any of them.

## Where the work is

Read **`docs/epics/plan-landing-parity.md`** first. It is the whole of this: twenty-three
differences between the mockup's home page and the built one, counted by rendering both at 1440px
and comparing element by element, plus the epics that close them.

**`docs/backlog.md` does not know the mockup-parity programme exists** — `CLAUDE.md` reserves that
file for Soroush. `docs/epics/plan-mockup-parity.md` is the sequence and supersedes the backlog for
what comes next. `PROMPT_CONTINUE` says to pick the next epic from the backlog; for this programme,
pick it from there.

## What is already merged into local `main`

EPIC-023 (app shell), EPIC-024 (page composition), EPIC-016b (the home page in full), EPIC-016c
(the rotator). All four `gates.mjs ci` green. `origin/main` is behind local `main`; nothing is
pushed, so no staging URL is evidence about any of it.

## The state of the landing page, as of 2026-09-21

Structurally it is the mockup's: product shot, run demo, failure attribution, provider comparison,
five-tab rotator, proof band. **Colour tokens are identical** — both pages measure
`rgb(239, 237, 230)` on `body`, and every palette token matches except `--color-ink-3`, nudged for
WCAG AA and recorded in `docs/design/README.md`.

Twenty-three differences remain. Nineteen are plain work.

## The four questions

1. **The trust row** — the mockup names NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL and BLUEPRINT as
   customers. They are invented. Real names, those five as an approved placeholder, or leave it out?
2. **The three counters** — *1,240,000 prompts decompiled*, *38% contain a contradiction*, *4s
   median rollback*. All three are fabricated. Real numbers, approved placeholders, or the three
   true sentences that stand there now?
3. **The hero headline** — restoring the mockup's *"Stop guessing which prompt works."* reverses
   **Soroush's own decision of 2026-09-11**. `page.test.tsx` pins the current sentence with a note
   saying it changes only because he replaced it.
4. **Blok kind colour** — the mockup's palette collides with `CLAUDE.md` rule 10 *literally*:
   `[data-k=expected]` is `#0B5C2E`, which is `--color-pass` exactly, and `[data-k=example]` is
   `#8A5A00`, which is `--color-warn`. **Recommended: make EPIC-021a's existing six-hue palette
   persistent** — blue/violet/magenta/clay, already measured to 3:1, already shipped as
   interaction-only. That gives the mockup's look with no collision. Copying `--kc`'s literal values
   needs rule 10 amended across the whole product.

## What to do once they are answered

`plan-landing-parity.md` has the epic breakdown. **EPIC-016d is the one to write first**: it closes
fifteen of the twenty-three and depends on nothing that does not exist. Five of the remaining
differences are links to pages that do not exist yet — `/pricing` (EPIC-070), `/about` and
`/careers` (EPIC-072b), `/blog` (EPIC-073), `/learn` and nine lessons (Stage 7) — so full parity is
two epics for the page itself and seven more for what it links to.

One thing flagged and deliberately not decided: the built nav carries a **`Decompiler`** link the
mockup does not. Strict parity removes it; it is the only link to the product's one public tool. It
stays unless Soroush says otherwise.
