<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Session — EPIC-042, 2026-09-16

**Prompt sent.** Read `CLAUDE.md`, `docs/PROCESS.md`, `docs/AUTONOMOUS.md`, `docs/epics/CURRENT.md`,
`docs/backlog.md` and `docs/decisions/AUTONOMOUS.md`; work out where the project actually is from
git and the filesystem; then pick up the next epic from the backlog and build it to the Definition
of Done. Ask at the end whether to close the session or continue.

**Where the project actually was.** Local `main` at `b488cad` (EPIC-043's merge), tree clean, 17
commits ahead of `origin/main`. Every Stage 4 row had a report except **EPIC-042**, which was `todo`
and had no epic file — the same position EPIC-040, 041 and 043 were in, so the same precedent
applied and I wrote the file.

## Plan, in one paragraph

Two adapters behind EPIC-031's existing `Provider` interface; a model catalogue in `packages/db`'s
`constants.ts`, which already exists to hold what both apps must agree on; the price table extended
with a provider per row; `provider_keys` given a switch and four columns for a test verdict; a
settings page; a second run trigger creating one run per keyed provider under EPIC-041's
`comparison` id; the matrix and the heatmap as pure view models with components over them. The plan
is `docs/epics/plan-EPIC-042.md` and it carries the eight decisions taken before any code.

## Decisions, and where they are recorded

Eight in the plan, eight in `docs/decisions/AUTONOMOUS.md`. The two that matter most are the ones
EPIC-043 explicitly deferred to this epic — **where the "test this key" call runs** (the worker, so
`web` never needs the master secret) and **`043e`** (decided, not built, with the finding that
decides it). Report §3.

Two more were taken during the work rather than before it: **the judge gets its own provider**
(report §11.1), and **the verifier lives in `packages/db`** because `apps/web` must answer before
sealing, `apps/worker` must answer about a sealed row, neither app may import the other, and a
second copy would go stale silently.

## What took longer than expected

**One line to fix, forty minutes to understand.** The e2e suite made a real HTTPS call to
`api.anthropic.com` — the fake verifier existed in `apps/web` and the worker's test-key job called
the verifier directly. That is a one-line-shaped defect. What cost the time was the **three other
tests** that failed alongside it, none of which had anything to do with the product:

> Playwright shuts its worker down after a test times out and starts a fresh one, which re-runs
> `beforeAll`. `beforeAll` signed in as `providers-${Date.now()}`, so the replacement worker had a
> different user, and three tests that used a key an earlier test had stored failed for reasons of
> their own making.

I spent too long reasoning about which code path could delete a `provider_keys` row. What settled it
in ninety seconds was polling `provider_keys` and `users` from outside the run every two seconds and
watching the user count go `1 → 0 → 1` mid-suite. `docs/PROCESS.md` says exactly this — *probe the
thing rather than reasoning about it* — and I read it this morning and still did it the slow way
first. Recorded here rather than smoothed over.

The fix is in the spec and in the report §5: every test builds the state it asserts about, through
an idempotent `ensureKey`, and the keyboard walk moved inside the test that makes the run it walks
over. One defect now produces one failure.

**Second-longest: a version skew in the AI SDK.** `@ai-sdk/anthropic@4.0.53` pins
`@ai-sdk/provider@4.0.14`; the new `@ai-sdk/openai` and `@ai-sdk/google` pin `4.0.17`. Two
structurally identical `LanguageModelV4` types from two copies of one package is forty lines of
`tsc` output that says nothing about the code. Bumping `anthropic` and `ai` to the current 4.x/7.x
fixed it in one command.

## The browser drive

Three real findings, report §4: the real provider call; a partner run in flight rendering as
"nothing graded"; and the drive's own all-passing fixture, which meant the heatmap's shape
difference had never been rendered for anybody to look at. Plus one found by simply reading the
screenshot — `google.ts` claimed the settings page warned about the unpaid Gemini quota and it did
not.

Eleven screenshots in `docs/epics/reports/screenshots/EPIC-042/`, at 1440px and at 390px.

## Verification, tail

```
CI mode — every gate CI runs, every result
  checkout      git clone + checkout 22a16bf8      PASS   0m02s
  ci.yml        pnpm install --frozen-lockfile     PASS   0m07s
                pnpm lint                          PASS   0m22s
                pnpm typecheck                     PASS   0m50s
                pnpm db:migrate                    PASS   0m03s
                pnpm test                          PASS   0m47s
                playwright install chromium        PASS   0m02s
                pnpm e2e                           PASS   5m51s   4 test(s) skipped on darwin
                uv run pytest -q (sdks/python)     PASS   0m05s
  compliance.yml  reuse lint                       PASS   0m04s
                  pnpm boundaries                  PASS   0m04s
                  turbo boundaries                 PASS   0m01s
                  pnpm forbidden-words             PASS   0m01s
                  pnpm binary-files                PASS   0m01s
                  license-gate --sbom              PASS   0m02s
                  pnpm mirror-dry-run              PASS   0m33s
  16 step(s), all passed, 8m55s

  What a green here still does not cover
    · The runner is Linux and this is darwin: the four visual-regression baselines
      are `-linux.png` and their specs skip here.
    · The runner is slower than this machine.

DRIVE PASSED — 11 screenshots in docs/epics/reports/screenshots/EPIC-042
```

## Open questions

Six, in the report §11. The three that would change what somebody builds next:

1. **The judge silently spends Anthropic money on a run against OpenAI**, because `JUDGE_MODEL` is
   an Anthropic model and is now resolved on the owner's own Anthropic key. Honest, rendered
   honestly, and possibly not what you want.
2. **Rule 6's normalised payload** is still unanswered and now applies to three adapters instead of
   one. The handling is in one place, so the fix is still one change.
3. **The platform-key fallback and the providers' reselling clauses.** Written down in
   `docs/providers/usage-policies.md`; EPIC-070 is the row that has to answer it.

## Handover

`docs/epics/HANDOVER.md` is refreshed. **Stage 4 is complete** — 040, 041, 042, 043 all have
reports. The next thing is not an epic: `docs/AUTONOMOUS.md` stops the loop after every third
completed epic and this is the fourth since the last release, so a release is overdue and
`RELEASE-DUE.md` is stale. After that, Stage 5a begins at EPIC-050.
