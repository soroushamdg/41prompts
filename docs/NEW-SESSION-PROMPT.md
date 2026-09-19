<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# The prompt to start a new session with

Paste the block below into a fresh Claude Code session in this repository. Nothing else is needed.

**It deliberately contains no project state.** Every fact a session needs — which epic is next, what
is blocked, what was decided — lives in files that are updated as the work happens. A prompt that
repeated them would be wrong within a day and confidently wrong within a week, which is worse than
saying nothing. So this tells a session *where to look* and *how to work*, and nothing about where
things stand.

---

```
Read these, in this order, before doing anything:

  CLAUDE.md                  the rules, the stack, the vocabulary, the Definition of Done
  docs/PROCESS.md            how the work is done, and every rule written from a past failure
  docs/AUTONOMOUS.md         the loop, step by step — it is the standing instruction, follow it
  docs/epics/CURRENT.md      the epic that was last being worked
  docs/backlog.md            what is done, what is next, what is blocked and on whom
  docs/decisions/AUTONOMOUS.md   decisions taken without asking, most recent last

Then work out for yourself where the project actually is, from git and the
filesystem rather than from any of the above:

  git log --oneline -15
  git status
  git log --oneline origin/main..main     # what is merged locally and not pushed
  ls docs/epics/reports/                  # an epic with a report is done

Then pick up the next epic from docs/backlog.md and build it, following
docs/AUTONOMOUS.md's loop: epic file -> plan -> implement -> gates -> drive the
built app -> merge into local main -> report -> tick the backlog row.

Rules that catch people out, so read them rather than rediscovering them:

- Nothing is pushed. Never `git push`, never open or merge a pull request.
  `node scripts/gates.mjs ci` is the only CI there is. Merge with `git merge --no-ff`
  into local main. See CLAUDE.md, "Nothing is pushed".
- Every epic ends with the feature driven by hand in a browser against the BUILT
  app (`turbo run build --filter=@41prompts/web`, then `next start`), screenshotted
  into docs/epics/reports/screenshots/EPIC-xxx/. Never `pnpm dev`. The last three
  epics each had a defect that only the drive caught. `scripts/drive-epic-034.mjs`
  is the worked example; its header has the commands.
- `pnpm e2e` and the drive need their own Postgres:
      docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
        -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
      export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate
  Docker Desktop is often not running; `open -a Docker` and wait for `docker info`.
  Kill any server you started by hand before running `pnpm e2e`, or Playwright
  reuses it without the environment the suite needs and sign-ins fail on a rate
  limit that looks like a broken login.
- A gate row (▣) in docs/backlog.md is Soroush's decision. Stop there and ask; do
  not step around it.
- A row whose status names something only Soroush can do — an account, a payment
  method, a lawyer, recruited participants, a key — is skipped, not blocked on.
  Say so in the report, in its own numbered section. Do not fake it.
- When a symptom looks environmental, probe the thing rather than reasoning about
  it. Print the value, list the processes, curl the endpoint. Three mysteries in
  three epics were each settled in under a minute that way after being guessed at
  for much longer.

Work carefully rather than quickly, verify claims against the repo rather than
from memory, and say plainly when something cannot be done and why.
```

---

## Why it is shaped like this

**It names the reading order.** `CLAUDE.md` is loaded automatically, but the other five are not, and
a session that skips `PROCESS.md` will rediscover a failure that is already written down in it.

**It tells the session to distrust the prompt.** The four `git` commands exist so a session
establishes the state itself. `CURRENT.md` can point at an epic that has since shipped; `backlog.md`
can be one commit stale. Git is not.

**Six rules are inlined rather than left to the reading.** Each one is a mistake that has actually
been made here: pushing, driving the dev server, a missing database, a reused server, walking past a
gate, and faking a human step. They are in the docs too — they are repeated because a session that
gets one of them wrong wastes an hour before finding out.

**It does not say what to build.** That is `docs/backlog.md`'s job, and it changes every epic.
