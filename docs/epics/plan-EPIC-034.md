<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# Plan — EPIC-034: Activation onboarding

Branch `epic/034-activation`. Written before any code.

## What exists, so nothing is rebuilt

- `EVENT_NAMES` already contains `run_started` and `run_passed`, **emitted by nothing**. Only
  `signup` and `login` are ever sent (`lib/auth.ts`).
- `captureEvent(distinctId, name, properties?)` takes properties; `captureAccountEvent(userId, name)`
  does not pass any. One argument is the whole gap.
- `captureAccountEvent` already refuses without consent and honours `DNT` and `Sec-GPC`.
- `users.createdAt` is the signup instant.
- EPIC-032 built the runs page, the trigger, the failure detail and "Create constraint from this
  failure" — the second half of the journey is already there and is not touched.
- `createSuiteRun`, `addInputSet`, `addBlok`, `declareVariable` all exist and are owner-scoped.

## The journey, and where each piece lives

```
sign up ─► /app/projects (empty)
              │  "Start from an example" — beside the empty state, never inside it
              ▼
  exampleAction()  one transaction: project + prompt + bloks + variable + input set
              │
              ▼
  /app/pr/<id>/runs  ─ Run ─►  run_started
              │
              ▼  first run fails, by construction (decision 2)
  failure detail ─► "Create constraint from this failure" (EPIC-032, untouched)
              │
              ▼  Run again
        no failures ─► run_passed { secondsFromSignup }
```

Progress is derived at every step from rows that already exist (decision 4).

---

## 1. `apps/web/lib/activation/example.ts` — the content, in one place

The example prompt's text, as data. A support-reply prompt with:

- two `context` bloks, one of them ending in `{{question}}` so the fake provider's echo makes the
  journey steerable end to end, exactly as EPIC-032's does;
- one `expected` blok whose text `checkKindFor` **derives a kind for** — asserted by a test, not
  trusted (note 5), because EPIC-033 found two of the eight kinds unreachable and an example whose
  check is `not_graded` would walk the whole path and prove nothing;
- an input set of two rows, one of which makes that check fail.

`EXAMPLE_LABEL` is the word that marks it everywhere it appears (decision 1).

## 2. `apps/web/lib/activation/actions.ts`

**`startFromExampleAction()`** — one transaction, returning the prompt id:

project → prompt → bloks → variable declaration → input set. **All or nothing**: a half-made example
is worse than none, and the person cannot tell which half they got.

It returns the runs-page path, so the caller navigates rather than the action redirecting — the
pattern every other action here uses.

## 3. `apps/web/lib/activation/progress.ts` — derived, pure, unit-tested

```ts
activationSteps({ hasExample, runs }) → [{ key, label, done }]
```

Four steps: **an example to work on · run it · see what failed · make it pass**. Every one is a
question about rows: does the prompt exist, is there a run, did a run finish with a failure, did a
run finish with none. Pure so it can be tested without a browser, and derived so it cannot disagree
with what happened.

## 4. Events

- `captureAccountEvent(userId, name, properties?)` — one optional argument, passed straight through
  to `captureEvent`, which already accepts it. Consent behaviour unchanged.
- `run_started` in `startRunAction` (EPIC-032's trigger).
- `run_passed` where a run reaches a terminal state with **no failures** — read from the stored
  results via EPIC-030's `summarise`, using `noFailures` and not "the run finished" (note 3).
- `secondsFromSignup` from `users.createdAt`.

**Where `run_passed` fires is the one real design question.** The worker finishes the run, but the
worker has no session, no consent cookie and no `headers()` — `captureAccountEvent` is built on
Next's request context and cannot run there. So it fires **on the run page**, the first time it is
rendered for a finished run with no failures, guarded so it fires once. That is honest: it measures
the moment the person could see they had passed, which is the thing the five minutes is about.

## 5. `apps/web/app/app/projects/page.tsx`

The offer, beside the empty state. It says what it will create before it creates it — the same
discipline as EPIC-032's constraint preview.

## 6. Tests

- **web (vitest)**: the four progress steps against every combination of rows; `secondsFromSignup`
  arithmetic; the example's expected blok derives a check kind (note 5); `captureAccountEvent`
  passes properties and still refuses without consent.
- **e2e**: the timed path, and a test that a **blank** prompt still has no bloks (decision 1's other
  half — the thing that would quietly regress).
- **timing**: measured from the first click after signup to the passing run, excluding the build and
  the browser start, and the report says so (note 2).

## 7. Risks

| risk | fallback |
|---|---|
| `run_passed` fires more than once for one run | Guard on the run's own state and assert once in the e2e. If it proves flaky, the event moves behind a stored `notified_at` and the report says a column was added after all. |
| The example's check stops deriving a kind after a `rule-shapes.json` edit | The test in §6 fails, which is the point of asserting it rather than trusting the phrasing. |
| The five-minute assertion measures the machine | Time the journey, not the suite (note 2). The budget is 300s and the path is ~10 interactions; if it ever approaches the budget, that is a real finding rather than a flaky test. |
