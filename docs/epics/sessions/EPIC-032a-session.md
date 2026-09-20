<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-032a session — 2026-09-19

Written as if the next session has no memory of this one, because it does not.

## How this epic started

Not from the backlog. The session began by running `PROMPT_CONTINUE`, which stops the loop: the
picker halts on `▣ GATE 3` and every remaining row needs Soroush. He then asked to run Part A of the
handover (the app, locally), hit a wall on step 5, and — after that was diagnosed — asked for this
feature directly.

**The wall is worth recording**, because two of its three causes were mine:

1. `pnpm db:migrate` does not read `.env`. `packages/db/drizzle.config.ts` falls back to
   `postgres://41p:41p@localhost:5432/41p`, and on this machine port 5432 is another project's
   Postgres. `DATABASE_URL` must be exported into the shell first. Nothing documents this.
2. The Runs page needs an **input set** before it can run anything, and the handover's step 5 said
   "give it an input" — which is not a thing the page offered. That gap is this epic.
3. The **worker** was not running. Runs are pg-boss jobs; the web server queues and never executes.

The red *"This cannot go Live yet"* banner he saw was none of these — it is the publish gate, and
correct on a fresh Draft.

## The plan, and that it held

`docs/epics/plan-EPIC-032a.md`, written before code and shown before implementing per `CLAUDE.md`.
Nine files, no migration, order of work fixed with the A6 test first. **It held.** The one thing the
plan did not predict is that `"use server"` would make `actions.ts` unable to export a helper, which
moved `editRefusalFor` into `queries.ts` — an improvement, because the rule now has tests.

## What took longest

**Not the feature — the two rounds of test-and-drive feedback.** The implementation was about an
hour; the four e2e failures and then the drive's two findings were the rest. Every one of the six was
worth the time and four of them were mine rather than the product's:

- the fixture with no `expected` blok, so "By input" had nothing to lay out (mine);
- `getByRole(name: "Edit X")` matching "Duplicate and edit X" by substring (mine);
- `.app-empty` ambiguous because Run history has one too (mine);
- asserting the input value on the pivot rather than on the cell detail behind it (mine);
- `runs.spec.ts`'s Tab walk, which was correct to fail — the tab order really changed;
- and the two the drive found, §5 of the report.

## The thing to know before touching this again

**A `suite_run` does not snapshot its inputs.** It freezes `prompt_text` and `prompt_hash` and keeps
`input_set` as a foreign key; the run detail page reads the rows live. Everything about decision 3 —
the run count, `editRefusalFor`, Duplicate and edit — exists because of that one fact. If somebody
later adds a rows snapshot to `suite_runs`, `editRefusalFor` is what they delete, and the epic file
says so in Out of scope.

## The lesson that generalises

**An accessible name is computed from the DOM; CSS never reaches it.** A `getByRole` assertion
cannot see a `text-transform`, so a header rendering a case-sensitive variable name as `REQUEST`
passed every accessibility-shaped assertion in the suite. Only reading `innerText` off the built app
found it.

That is a new instance of a pattern `PROCESS.md` already carries under a different name — a check
that normalises the thing it is checking cannot see a defect in it. Worth remembering the next time
a test's selector and a person's eyes are assumed to see the same string.

**And the second drive finding needed no code at all — just looking at the screenshot.** The empty
state telling you to "add inputs by hand" underneath the grid you are typing into is not findable by
any assertion nobody thought to write.

## Verification, exactly

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate

pnpm test && pnpm typecheck && pnpm lint && pnpm dead-code
pnpm e2e                                    # 328 passed, 4 skipped, 0 failed
node scripts/gates.mjs ci --allow-dirty     # 17/17, 12m56s, on 2b8e636

# the drive
npx turbo run build --filter=@41prompts/web
node -e 'import("./apps/web/e2e/env.mjs").then(m=>{for(const[k,v]of Object.entries(m.placeholders(3120)))console.log(`export ${k}=${JSON.stringify(v)}`)})' > /tmp/032a.env
set -a && . /tmp/032a.env && set +a
FAKE_PROVIDER=1 pnpm --filter @41prompts/worker start &
pnpm --filter @41prompts/web start --port 3120 &
npx tsx scripts/drive-epic-032a.mts         # 19/19
```

`--allow-dirty` was needed for `app-icon.jpg`, which is untracked and not this epic's — the same
flag EPIC-901 and EPIC-900 both needed for the same file.

## Open questions

1. **The word.** "input" was chosen over the request's "test case"; report §3. One rename if he
   disagrees.
2. **Editing a refused CSV in the grid** — offered as EPIC-032b, not built.
3. **No backlog row** was added for this epic; `docs/backlog.md` is his file.
