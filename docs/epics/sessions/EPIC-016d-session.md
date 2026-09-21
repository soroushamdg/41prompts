<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session — EPIC-016d

**Date** 2026-09-21. **Branch** `epic/016d-landing-parity`.

## The prompt

`PROMPT_CONTINUE` — read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`,
`docs/epics/CURRENT.md`, `docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`, work out where the
project is from git and the filesystem rather than from any of them, then pick up the next epic and
build it to Definition of Done.

## Where the project actually was

`CURRENT.md` was accurate for once, and it said **stop**: *"No epic is in progress — EPIC-016d is
planned and waiting on four answers."* Three of the four decide whether the site publishes something
about the company that is not true; the fourth decides whether `CLAUDE.md` rule 10 changes.

Git agreed and added one thing the file did not say. The branch named in the session's opening
snapshot, `epic/016d-landing-parity`, no longer existed: `git reflog` showed it had been created,
given one docs commit, cherry-picked onto `main` and deleted. So there was no work in progress to
resume — only a plan and four open questions.

`main` was 32 commits ahead of `origin/main`, tree clean, no `STOP`, no run state.

## The four questions, asked

`docs/AUTONOMOUS.md`'s "never stop to ask" is written for a run with nobody to ask. **This session
had somebody**, so the four were put to Soroush before any code was written, and his answers are in
`docs/decisions/AUTONOMOUS.md` with the nine that came up while building.

The answers that mattered most to the shape of the work:

- **Two of the four were "build nothing"** — leave the trust row out, keep the three true sentences
  where the mockup's counters are. That collapsed the planned EPIC-016e into this epic, because the
  only thing left of it was the headline.
- **Blok kind colour became persistent**, on EPIC-021a's palette, which reverses decision 6 of that
  epic and rewrote a guard that had been pinning the opposite rule.

## Plan summary

Five steps, in an order chosen so the two that move the visual baselines come before the
regeneration: kind colour → nav → hero → copy and the shot's pane bar → drive, then baselines.

It survived contact with one exception. Step 4 grew a sixth item — the product shot's cards were
still ink while the rotator's were coloured, because the shot is not a `BlokCard`. C2 says *every*
blok card, and the shot's is the most visible one on the page.

## What took longer than expected

**The nav at 375px, and it was not what it looked like.** `pnpm e2e` failed one test — the nav on
two rows — and the obvious reading was "one control too many". Measuring it at seven viewports
against the built app found two separate defects, neither of which was the number of controls:
`.btn` never inherited the `white-space: nowrap` that `.site-nav-link` has carried since EPIC-016,
so "Sign in" broke *inside its own button*; and the row-count assertion was reading a zero-height
`flex: 1` spacer as a second row, which would have failed at 390px on a nav that was fine.

**One minute of that was spent on a mystery and the rest on the fix**, because the first measurement
run reported an unstyled page at every width and the server log said `EADDRINUSE`: a stale
`next start` was serving a `.next` that had been overwritten underneath it. `docs/PROCESS.md` says
probe the thing rather than reason about it, and it was right again. EPIC-016c's session log records
the identical failure, which is the second time in two epics.

**AppleDouble files cost a round trip in the Linux container.** macOS `tar` writes `._*` resource
forks beside every file, Playwright collected `._landing.spec.ts` as a spec, and the run died on a
`SyntaxError` inside a resource fork. `COPYFILE_DISABLE=1` is now in the report's procedure.

## What the drive found that nothing else did

Two things, and one of them was about the drive itself.

1. **The drive's own line lied while failing.** `innerText` is the rendered text and `.eyebrow` is
   `text-transform: uppercase`, so a case-sensitive `includes` failed on a page that is correct —
   EPIC-032a's `REQUEST`/`request` shape again, except that there the transform *was* the defect.
   The line printed "eyebrow · headline · lede, all the mockup's" **while reporting FAIL**, because
   its detail was a fixed string rather than what it had measured. Every detail in that script is
   now built from the check it reports, which is the part worth carrying forward.
2. **The Ask sheet's promise is only checkable at the URL.** The sheet says "this is exactly what
   will be sent"; the drive intercepts `window.open` and reads the query string. Nothing in the
   repository had ever looked at it, and `ask-chip.tsx` had carried a comment since EPIC-016b saying
   a test asserted the encoding — naming a file that did not exist. It exists now.

## The gate, and one thing beyond it

`node scripts/gates.mjs ci` is in the report's §10.

**Beyond it: the full e2e suite was run on Linux, twice, in
`mcr.microsoft.com/playwright:v1.63.0-noble`** — 370 passed, **0 skipped**, where every local run
skips four. `docs/PROCESS.md` names "the runner is Linux" as one of three things a green
`gates.mjs ci` does not cover and explains at length why the e2e step does not move into that
container permanently (it does not fit, and it roughly doubles the mode). Running it once by hand,
with a person watching, is a different act from making it a gate — which is exactly the argument
that file already makes about regenerating baselines.

## Tail of the verification output

```
pnpm test        9 of 9 packages, 1437 tests
pnpm typecheck   9 of 9 packages
pnpm lint        12 of 12, forbidden-word grep clean
pnpm dead-code   933 exported values, none orphaned
pnpm e2e         370 passed, 4 skipped (Linux-only baselines) on darwin
linux e2e        370 passed, 0 skipped, in the Playwright container
linux baselines  2 rewritten, 4 compared clean
drive            23/23
```

## Open at the end of the session

The report's §11 has all four. The two worth a second look:

1. **The run demo's heading says "Six checks" over five rows** — the mockup's own copy, shipped by
   EPIC-016b, put out of scope here rather than re-decided quietly. One line either way.
2. **`See the workbench` goes to `/features`, not to the workbench.** The mockup sends it to the
   signed-in editor, which for a signed-out reader is a sign-in wall.

And the standing one: `docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20, and
`origin/main` is now far behind local `main`.
