<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-900: Tech-debt sweep — the first run, and the gate that makes the next one a second

Stage: Ongoing · Depends on: — · Size: **M** (the backlog says S; see §Size below)

**Written by Claude Code in the advisor's chair**, 2026-09-19, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-057, EPIC-072 and EPIC-901 set.

`docs/roadmap.md`, Ongoing:

> **EPIC-900** every third sprint: dead code, dependency upgrades, boundary and compliance report,
> infra drill, CLAUDE.md accuracy.

## Goal

The five things that rot between sprints are **measured rather than assumed**, and the one that a
person cannot hold in their head — dead code — becomes a gate that fails the build instead of a
survey somebody repeats by hand every third sprint.

## Why this row, now

It has never run, and it is the last row in `docs/backlog.md` that needs nothing from Soroush
(`docs/epics/HANDOVER.md`, verified row by row on 2026-09-19).

The survey that produced this file found the repository in good order — **2 `TODO`s, both naming a
deferred epic; 0 orphaned source files; 0 unused declared dependencies; 1 `eslint-disable`; lint
12/12 and `pnpm compliance` clean but for one stray untracked file that is not ours.** That is worth
writing down, because "we swept and found little" is a result and the next sweep should be able to
read it rather than re-derive it.

It also found **39 exported values that nothing outside their own file names**, three of which are
**named nowhere in the repository at all** — `detectPatterns`, `checkCountForRun`,
`variablesForOwner`, each appearing exactly once, on the line that declares it. A monorepo of 602
source files grows that class silently: nothing fails, nothing is slower, and the module's export
list stops being a statement of what it offers. It is exactly the class a person cannot sweep by
hand and a twenty-line script can sweep in a second.

**So the deliverable is the gate, not the sweep.** `docs/PROCESS.md`'s argument about the e2e
container — *a gate nobody runs because it is slow covers nothing* — has a twin: a sweep scheduled
every third sprint is a gate that runs three times a year, and the thing it catches is created
daily. The findings below are what this run fixes; `pnpm dead-code` is what stops the next 39.

## Scope

1. **`scripts/dead-code.mjs`, run as `pnpm dead-code`.** One class of finding, deliberately: an
   **exported value** — `const`, `let`, `var`, `function`, `class` — that no other tracked source
   file names. Types are out (a type alias used only as an in-file annotation is not debt); so are
   the names a framework calls by convention rather than by import.

   **Wired into three places in one commit, so CI parity cannot drift**: `pnpm compliance`,
   `.github/workflows/compliance.yml`, and `scripts/gates.mjs`'s CI step list. `docs/AUTONOMOUS.md`
   is explicit that a mode claiming parity with CI must run what CI runs and no more, so a check
   added to one of the three and not the other two is the divergence that rule exists to stop —
   in either direction.

2. **`ALLOWED` in the gate, not a baseline file, and checked in both directions.** An export kept
   for a stated reason is silent; one that is not is a failure; **and an `ALLOWED` entry that no
   longer matches a live export also fails**, because a stale exemption is how a check quietly stops
   catching what it exists for. It lives in the script rather than in `docs/` for
   `scripts/license-gate.mjs`'s `HEADER_EXEMPT` reason, settled in EPIC-901 criterion A7: a gate that
   has to pass in CI cannot be exempted by a document CI does not read.

3. **The 39 findings resolved one at a time.** Three deleted outright; the rest either lose the
   `export` keyword — they are used inside their own file and the keyword was the only thing making
   them look like a surface — or earn an `ALLOWED` entry saying why.

4. **Dependency upgrades: the same-major set, applied and driven.** Every major is named with its
   reason for waiting instead, in the report. One of them is not staleness at all and the report
   has to say so: `@types/node` is pinned to 22.x **because `engines` pins the runtime to Node 22**,
   and 26.x would type against APIs that are not there at runtime.

5. **CLAUDE.md accuracy.** It is a Definition-of-Done line on every epic and it is wrong in two
   ways this sweep found: `packages/cli-unscoped` — a real, Apache-2.0, publishable package since
   EPIC-056 — is absent from both the Stack list and rule 11's enumeration of the public packages,
   and `pnpm audit-run` is absent from Commands although EPIC-901 made it the monthly audit.

6. **The boundary and compliance report.** `pnpm boundaries`, `turbo boundaries`, `pnpm compliance`
   and `pnpm lint` run, with their own numbers in the report rather than the word "clean"
   (`docs/PROCESS.md`, "A local gate is evidence only when it reports every package").

## Out of scope

- **The infra drill.** `infra/RUNBOOK.md`'s restore drill is SSH to the box, several mutating
  `docker exec`s and R2 credentials that live in Coolify. `CLAUDE.md` server-access rule 3 makes each
  one command, one yes, and `docs/AUTONOMOUS.md` puts a Coolify deploy in the same category as
  touching production. **Skipped, not faked**, with its own numbered section in the report naming the
  exact commands Soroush would run. This is the `docs/AUTONOMOUS.md` rule — a row whose dependency is
  a person is skipped and said out loud, never half-built.
- **Every major dependency bump**: `eslint` 9→10, `@eslint/js` 9→10, `typescript` 5→7, `vitest` 3→4.
  The last is already triaged in `docs/security/audit-baseline.json` with `reviewOn` 2026-12-18 and
  re-deciding it here would be re-litigating a decision three weeks old. The others are each a
  change with its own blast radius across nine packages; a sweep that also migrates a lint config is
  a sweep nobody can review.
- **Deleting `app-icon.jpg`.** It is untracked at the repository root, it is not this session's, and
  it fails `reuse lint`. Reported, not removed — deleting a file somebody else put there is not a
  tech-debt fix. See the report's §on it.
- **Unused-`type`/`interface` detection.** A type alias used once, inline, in its own file is not
  debt, and a check that reports 113 of them teaches people to skip the output. The gate's tight
  class is the whole reason its output is readable.
- **Anything in `docs/decisions/*`, `docs/roadmap.md` or any backlog row but this one's status cell.**
  `CLAUDE.md`'s never-touch list and `docs/AUTONOMOUS.md`'s two carve-outs.

## Acceptance criteria

- [ ] **A1.** `pnpm dead-code` reports every finding with its file, its kind and its name, and exits
      non-zero when there is one. Verified: `scripts/dead-code.test.mjs`, and the report's transcript.
- [ ] **A2.** An export named nowhere else **fails** the run, and the same export passes once it is
      in `ALLOWED`. Verified: `scripts/dead-code.test.mjs`, positive and negative control.
- [ ] **A3.** An `ALLOWED` entry matching no live export **also fails**. Verified:
      `scripts/dead-code.test.mjs`.
- [ ] **A4.** The gate does not fire on a name a framework calls by convention — `generateMetadata`,
      `GET`, `middleware`, a Next.js `page.tsx` default. Verified: `scripts/dead-code.test.mjs`
      against a fixture tree, **and** the real tree passing with no such entry in `ALLOWED`.
- [ ] **A5.** `pnpm dead-code` is green on the real tree, and every one of the 39 findings is either
      deleted, de-exported, or in `ALLOWED` with a reason. Verified: the run, and the report's table
      of all 39 with its verdict.
- [ ] **A6.** The check runs in all three of `pnpm compliance`, `.github/workflows/compliance.yml`
      and `scripts/gates.mjs`'s CI step list, and a test fails if it is in one and not the others.
      Verified: `scripts/dead-code.test.mjs`'s parity case.
- [ ] **A7.** Every same-major dependency upgrade is applied, and `pnpm test`, `pnpm typecheck`,
      `pnpm lint` and `pnpm e2e` are green after. Verified: the report's gate table.
- [ ] **A8.** CLAUDE.md names `packages/cli-unscoped` in the Stack list and in rule 11, and
      `pnpm audit-run` in Commands. Verified: the diff, and the file read end to end against the tree.
- [ ] **A9.** `node scripts/gates.mjs ci` green on the commit, all steps. Verified: the report's gate
      table, with the closing "what a green here still does not cover" block read and answered.
- [ ] **A10.** No user-visible surface changes — this epic ships no route and no UI string — so the
      browser-drive item is answered by its own numbered section **plus** a drive of the built app
      proving the dependency upgrades broke nothing that renders. React, Next and Better Auth all
      move in A7, so this is not a formality. Verified: screenshots in
      `docs/epics/reports/screenshots/EPIC-900/`.

## Verification

```
pnpm dead-code                     # the gate; exit 0 when nothing is orphaned
pnpm dead-code --explain           # what it scans and what it exempts, without scanning
node --test scripts/dead-code.test.mjs
pnpm compliance                    # boundaries, turbo boundaries, forbidden words, licence gate, mirror
pnpm test && pnpm typecheck && pnpm lint
node scripts/gates.mjs ci          # the only CI there is
```

## Notes for the implementer

- **The three genuinely dead functions each appear exactly once in `git grep`**, on their own
  declaration line. Confirm that again before deleting — a name that also lives in a `.md`, a
  `.json` or `sdks/python` would not show up in a TypeScript-only scan, and the gate scans more
  than TypeScript for exactly that reason.
- **`packages/core` and `packages/sdk-ts` are public packages and their surfaces are frozen** by
  ADR-005 and ADR-006 — but `index.ts` is that surface, not every `export` in the tree. Removing the
  keyword from an internal module changes no published API. `frozen.test.ts` in `sdk-ts` is the
  control and must stay green.
- **`apps/web/e2e/skips.ts` and `instrumentation*.ts` will look dead and are not.** Playwright loads
  the reporter by path from `playwright.config.ts`; Next calls `onRequestError` and
  `onRouterTransitionStart` by name. Convention, not import.
- `docs/security/key-inventory.md`'s test fires on any new `*_KEY`/`_SECRET`/`_TOKEN` name. Nothing
  here adds one, but the upgrade set touches `better-auth`, so if it does, the inventory gets a row.
- The `-linux` visual baselines: **React and Next both move in A7.** If a baseline shifts, it is
  regenerated in the container per `docs/PROCESS.md`, never with a `-darwin` file.

## Size

`docs/backlog.md` and `docs/roadmap.md` both size this **S**, and it is **M**. Items 1–3 are a gate
with a bidirectional allow-list and 39 hand-triaged findings; item 4 moves React, Next, Better Auth
and pg-boss under a full e2e run. Recorded here and in `docs/decisions/AUTONOMOUS.md`. **The
backlog's Size cell is not edited** — `docs/AUTONOMOUS.md`'s carve-out is the status cell of the
epic being worked and nothing else, which is EPIC-056's and EPIC-901's precedent exactly.
