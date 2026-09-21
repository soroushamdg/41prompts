<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Session — EPIC-016c

**Date** 2026-09-21. **Branch** `epic/016c-rotator-parity`.

## The prompt

`PROMPT_CONTINUE` — read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`,
`docs/epics/CURRENT.md`, `docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`, work out where the
project is from git and the filesystem rather than from any of them, then pick up the next epic and
build it to Definition of Done.

## Where the project actually was

`CURRENT.md` said *no epic is in progress* and named **EPIC-072b** as next. The newest commit on
`main`, `c44e451`, was newer than that file and carried **EPIC-016c** — scoped and planned by a
previous session, with nothing implemented and no branch. `plan-mockup-parity.md` had not been
updated either. So the file that `CLAUDE.md` calls the current epic was one commit stale, and the
sequence had to be read out of the commit log.

EPIC-016c was taken, because it is the newer instruction and because the plan explicitly says its
one open question does not block starting.

## The one thing that was asked rather than guessed

The epic's headline decision — narrow `landing.spec.ts`'s reserved-colour guard, or keep the page
monochrome — was put to Soroush at the **start** of the session with a recommendation and both
options costed, because he was present and the answer changed what got built. `PROCESS.md`'s
2026-09-15 amendment and EPIC-901's precedent both say to ask in that case. He ruled: **narrow it.**

Everything else was decided and logged in `docs/decisions/AUTONOMOUS.md` — five rows.

## What took longer than expected, and what it found

**The positive control for the narrowed guard did not fire.** Painting `--color-fail` onto a heading
produced no offender, which should have been impossible. Ten minutes of probing rather than
reasoning — printing both sides of the comparison — showed why: `getPropertyValue` on a custom
property returns declared text (`#0b5c2e`), `getComputedStyle` returns a computed value
(`rgb(11, 92, 46)`), and the guard compared them directly.

**The same probe was in four specs.** All four had been green and meaningless since EPIC-016. They
are now one module with six controls of its own. The routes themselves were clean — the corrected
probe finds nothing on any of the four — but that was not known until it was run.

This is `CLAUDE.md`'s own rule arriving late: *every absence assertion needs a positive control.*
Four absence assertions were written without one, and the cost was six epics of false evidence.

**The drive's own setup produced an unstyled page.** A `next start` left running across a rebuild
serves HTML pointing at a stylesheet the new build renamed. The first measurement pass reported
panels at 199px and a `<pre>` overflowing by 79px, and the temptation was to treat that as a layout
defect. Probing the thing — reading the server's log — showed `EADDRINUSE`: the restart had silently
failed and the measurements were of a stale process serving a page with no CSS.

**Two of three drive findings were things only a screenshot could say.** The Deliver panel
illustrated an SDK call that does not exist, and the Test panel's meter stretched the full card
width. Neither is a shape any assertion in the suite was looking for.

## Tail of the verification output

```
pnpm test        9 of 9 packages
pnpm typecheck   9 of 9 packages
pnpm lint        12 of 12
pnpm compliance  8 of 8, mirror dry run 289 pytest passed
pnpm dead-code   930 exported values, none orphaned
pnpm e2e         361 passed, 4 skipped (Linux-only baselines) on the full suite;
                 88 passed, 2 skipped on the four touched specs after the last copy changes
linux baselines  2 regenerated, then 4 passed in compare mode in
                 mcr.microsoft.com/playwright:v1.63.0-noble
lighthouse       / at 92 in the seventeen-route pass; 93/94/99/99/99 over five runs of / alone,
                 median 99, accessibility 100 every time
drive            18/18
```

## Open at the end of the session

The report's §11 has all four. The two worth a second look are the duplicated
`every-run-recorded` sentence — one line either way, and the decision is about the whole page — and
the fact that three specs outside this epic's scope were repaired, which is named in the report
rather than done quietly.

`docs/epics/RELEASE-DUE.md` has been waiting since 2026-09-20 and nothing has been pushed since
before EPIC-023.
