<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session · EPIC-040 · versions and semantic diff

Date: 2026-09-16 · Branch `epic/040-versions`

## Prompt sent

A new session, asked to read the docs, work out where the project actually was from git rather than
from the docs, and pick up the next epic. It turned out the next item was **GATE 3**, so the first
half of this session was not building at all.

## What happened before any code

1. **The session's own git snapshot was stale.** It showed `epic/031a-the-call` with an uncommitted
   drive script; EPIC-031a was in fact finished and merged at `b62433f`. Checked against `git log`,
   `git status` and both `/healthz` endpoints rather than believed.
2. **The next backlog row was `▣ GATE 3`**, which is Soroush's decision and a full stop.
3. **`docs/epics/GATE-3-readiness.md` had gone false.** It turned on the sentence *"no model has
   ever been called by this project"*, and EPIC-031a ended that. Both readings it offered rested on
   it — the No-go reading was literally "no-go until the first real call", an instruction with
   nothing left in it. Corrected in place and dated, with both readings kept and **neither chosen**.
4. **Soroush decided the gate in session**: Go for Stage 4, loud launch deferred. Written to
   `docs/decisions/GATE-3.md`, including what it knowingly waives.
5. **He also asked for `main` to be pushed**, which `CLAUDE.md` says Claude Code never does. Flagged
   once as his own rule, then done on his instruction — **and the rule was deliberately left
   unchanged**, at his direction: this was a one-off, not a convention change. The push was green in
   both GitHub workflows on the first attempt, and staging redeployed to `da42eee`.

## The epic file did not exist

`EPIC-040` had a backlog row and no file. `docs/AUTONOMOUS.md` says that stops the loop;
`docs/PROCESS.md`'s amendment of **2026-09-15** — one day newer — says Claude Code writes the file
itself when no advisor is relaying. Took the newer rule, and the older one's stated reason does not
apply here anyway: it exists because an unwritten row is *unknown*, and EPIC-040 is fully scoped in
`docs/roadmap.md` with Goal, Tasks, Tests and Review.

## The one design decision, and it went to Soroush

"Version on save" is unusable as written — autosave is debounced, so a paragraph is a dozen saves.
I planned the three rules (skip on unchanged hash, rewrite the open draft, pin on run), showed the
plan, and he chose it over an explicit "save a version" button after asking for the difference in
plain terms. The deciding argument: automatic guarantees every run points at a version you can
return to; a button guarantees it only when somebody remembered.

## What took longer than expected

**Two wrong guesses at selectors, both avoidable.** The first e2e spec I wrote invented
`.compiled-span` + "Edit" + "Span text". The real flow is `.compiled-notes > div` → "Edit by hand" →
`getByLabel("Edit this span by hand")` → "Save this span" → `data-presentation="edited"`, and it was
sitting in `compiled-pane.spec.ts` the whole time. Reading the existing spec first would have cost a
minute; guessing cost several.

**The drive's sign-in failed with "Something went wrong."** — the documented Better Auth
construction failure. I had invented environment values for `next start`. Probing the page (fill the
form, print the body text) named it immediately; the fix was to take the values from
`apps/web/e2e/env.mjs`, which exists precisely so they are not written out a fourth time.

## The defect the seam found

`snapshot()` compiled without `keep`, so a hand-edited prompt would have produced a version whose
`bloks` recorded the edit and whose `compiledText` did not. **Neither package's tests could see it**
— core was self-consistent, and db takes the snapshot as `unknown`. It only exists at the seam,
which is the argument for the e2e test and the drive step that now both assert it.

## Decisions inside the epic's latitude

- **`packages/db` does not import `@41prompts/core`,** and the versions test does not either. It
  would have been a new dependency for no test that could not otherwise be written, and it would
  have made the versions suite fail on a change to `BLOK_SEPARATOR`.
- **`recordVersionNow` is written out at all eight canvas actions** rather than hidden in a wrapper.
  A wrapper is invisible at the call site, and the failure it invites is an action added later that
  is quietly not versioned — a gap in a history with nothing to report it.
- **It never throws and never blocks a save.** The person's text is already written by then. A
  missing history entry beats a save that falsely reports failure. Raised in the report as an open
  question rather than settled silently.
- **Cleanup in the drive runs after verification, not as an unconditional last act** — carrying
  EPIC-031a's lesson forward rather than relearning it.

## Verification

```
node scripts/gate-run.mjs           # 16 steps, all passed, 7m59s, on 69f8af4
node scripts/drive-epic-040.mjs     # every check PASS, 6 screenshots
pnpm e2e                            # 209 passed, 4 skipped
```

## Open questions

Report §11. The sharpest is the first: a version that fails to record is a silent gap, and I chose
that over failing somebody's save. EPIC-041 is where surfacing it would live if he wants it surfaced.
