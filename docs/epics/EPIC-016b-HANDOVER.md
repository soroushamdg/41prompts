<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-016b handover — The home page, in full (**unfinished**)

**This is a handover, not a report.** Written 2026-09-21 because the session ended mid-epic. Four of
six sections are built and committed; the epic is **not** done, has **not** been gated, and has
**not** been merged. Nothing here should be read as a Definition-of-Done claim.

**It lives in `docs/epics/` and not in `docs/epics/reports/`, deliberately.**
`lib/site/changelog.test.ts` reads `reports/*-report.md` as the definition of *shipped* and fails on
a shipped epic the public changelog does not name — so filing a partial as a report would have
asserted, to a gate, that this epic is finished. It is not. When it is, the report goes in
`reports/EPIC-016b-report.md` and Stage 1's changelog row takes EPIC-016b.

Branch `epic/016b-home-page`, one commit: `f0c0a19`. Working tree clean.

## 0. Read this first if you are picking it up

`docs/backlog.md` does not know this programme exists — `CLAUDE.md` reserves that file for Soroush,
so the mockup-parity work is recorded only in:

- **`docs/epics/plan-mockup-parity.md`** — the sequence, and Soroush's four rulings of 2026-09-20.
  **This supersedes `docs/backlog.md` for what comes next.** `PROMPT_CONTINUE` says to pick the next
  epic from the backlog; for this programme, pick it from here.
- `docs/epics/plan-EPIC-016b.md` — this epic's plan, including the order of work still to run.
- `docs/epics/EPIC-016b-home-page-full.md` (= `CURRENT.md`) — scope and acceptance criteria.

Merged into local `main` already: **EPIC-023** (app shell) and **EPIC-024** (page composition), both
`gates.mjs ci` green. `origin/main` is **10 commits behind** local `main`; nothing is pushed, so no
staging URL is evidence about any of this.

## 1. What is built and committed

Four of the mockup's six missing home-page sections, in `apps/web/app/home-sections.tsx`:

| Section | State |
|---|---|
| The product shot — browser chrome, compiled pane beside canvas | built, static |
| "Watch it run" — the results table with pass rates | built, static |
| Failure attribution — output, and the check it failed | built |
| The provider comparison | built |

Every figure in all four sits inside `<Example>`, and that is load-bearing — §2.

## 2. The mechanism, which is the part worth not re-deriving

Soroush's ruling: the illustrative sections ship **with obviously-labelled example data**. They carry
about thirty figures, and both `page.test.tsx` and `site-claims.test.tsx` require every digit on a
public page to be listed with a reason.

Listing twenty run-demo figures as "example data" would pass and would **gut the rule** — the list
stops being a set of facts about the product and becomes somewhere to put anything inconvenient.

The precedent was already in `site-claims.test.tsx`: it strips `<pre>` because *"a model id and a
port inside a snippet are part of the sample, not claims about the product."* A number inside a
surface marked `Example` is the same kind of thing. So:

- `apps/web/app/example-surface.tsx` owns both the `<Example>` component **and** `withoutExamples`,
  because two guards need the stripper and two copies is two answers to "what counts as an example".
- The **numbers** rule reads the stripped projection. **The denylist does not** — a figure in an
  illustration is sample data; `SOC 2` in an illustration is still a claim.
- The consequence is the point: **example data is only renderable if it is labelled**, because an
  unlabelled figure fails the build.

**Three controls, mutation-tested rather than assumed.** Making the stripper a no-op fails *"does not
read a number inside one"*; making it strip everything fails *"does read the same number when it is
not inside one"*; and `page.test.tsx` has its own control asserting the stripping changes that
page's text, so a renamed class cannot silently leave every figure unchecked. Both mutations were
run and each failed exactly the expected test.

## 3. What is left

From `plan-EPIC-016b.md`'s order of work, steps 3 to 5:

1. **The capability rotator** — five tabs, 5s cycle, sweep indicator. **Real ARIA tabs**, not the
   mockup's `aria-selected` on plain buttons (`docs/design/README.md`). The fifth tab is
   **"Deliver", not "Learn"** — there are no lessons and the word is denylisted.
2. **Ask-AI chips**, through the existing `lib/landing/handoff.ts`, as `/features` already does.
3. **Motion**, with `prefers-reduced-motion` showing **end states, never skipping them**: the
   rotator on a panel, the meters filled, the rows landed.
4. **Lighthouse before and after.** This page is the one that can lose the ≥90 floor; EPIC-072
   measured 17 routes with a lowest score of 94. The report must say what hydrates and what the
   number was either side. `scripts/lighthouse-site.mjs`.
5. **Regenerate the two Linux visual baselines for `/`.** Unlike EPIC-023 and EPIC-024, these
   **will** move — `landing.spec.ts`'s snapshots cover this page. That is expected work, not a
   failure. Procedure: `docs/PROCESS.md`, "Visual-regression baselines, and Docker disk"; the
   container recipe is in EPIC-023's and EPIC-024's reports, including the macOS `tar` trap below.
6. Then: drive, finish this report, `gates.mjs ci`, `git merge --no-ff` into local `main`.

## 4. Two things deliberately not built, and why

Both are departures from a literal reading of the ruling, both are in the epic's Out of scope, and
each is a one-line change to its section if Soroush wants it anyway:

- **The trust-logo row** (NORTHWIND, OAKLINE, MERIDIAN AI, CASTELL, BLUEPRINT). Invented companies.
  The one element labelling cannot rescue: the whole function of a logo wall is to assert that named
  companies are customers, so an "example" logo wall is a contradiction rather than an illustration.
  `page.test.tsx` denylists `trusted by` for the same reason.
- **The three proof counters** — *1,240,000 prompts decompiled*, *38% contain a contradiction*,
  *4s to roll back*. Same argument one step removed: a counter's entire content is *this is a real
  measurement*, so marking one as an example empties it. Three true sentences from the claims
  registry stand where they were.

## 5. The mistake this session, recorded so it is not repeated

The first screenshot of the new page came back **completely unstyled with none of the new sections**
— the exact signature of the 2026-09-13 outage. It was not one.

`pkill -f "next start"` **did not kill the server**. `next start` then failed with `EADDRINUSE`, and
the screenshot was of the *old* build served by a process whose CSS chunks had just been overwritten
by the rebuild underneath it. The server log said `EADDRINUSE` on its first line.

That was the **third** time in one session of trusting a process operation without verifying it took
— port 3000 contention, two overlapping `pnpm e2e` runs sharing one server, then this. The fix is
the same each time and should be the default:

```
lsof -ti tcp:<port> | xargs kill -9; sleep 2
[ "$(lsof -ti tcp:<port> | wc -l)" = "0" ] || exit 1     # assert it is free
# after starting: confirm the CSS chunk the HTML names actually returns 200
```

The general form, which is `PROCESS.md`'s own rule: **failures too fast and too broad to be real are
infrastructure, not code.** Sign-in does not break because a blok card got shorter.

## 6. Gates as of this commit

`pnpm test` **9 of 9 packages**, `tsc` clean, `eslint` clean, `pnpm forbidden-words` clean,
`pnpm dead-code` clean. **`pnpm e2e` has not been run** since the sections landed, and
**`gates.mjs ci` has not been run at all** for this epic.

## 7. Environment notes for the next session

- The throwaway Postgres: `docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 …` then
  `pnpm db:migrate`. It is **not** running; it was `--rm` and this session ended.
- **`.turbo/cache` reached 43 GB this session** and took the machine to 15 GB free, which made
  Docker Desktop restart mid-gate and produced a run `gates.mjs ci` correctly refused to call a
  result. Clearing the cache took it to 57 GB. Check `du -sh .turbo/cache` before blaming anything
  else for a gate that dies at setup.
- macOS `tar` writes AppleDouble `._*` siblings into the Linux-baseline container and Playwright
  tries to collect `._dev-ui.spec.ts` as a spec. `COPYFILE_DISABLE=1` on both sides of the pipe,
  plus `find /repo -name "._*" -delete` inside the container.
