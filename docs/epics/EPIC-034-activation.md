# EPIC-034: Activation onboarding
Stage: 3 · Depends on: EPIC-032 · Size: S

**Written 2026-09-15 by Claude Code in the advisor's seat**, per `docs/PROCESS.md`'s amendment of
that morning: when nobody is relaying, Claude Code writes the epic file and logs every decision it
makes in that seat to `docs/decisions/AUTONOMOUS.md`. Goal, tasks, tests and review come from
`docs/roadmap.md`; the decisions below are new.

## Goal
Signup to first passing run in under five minutes, measured.

---

## The thing to read first: this epic's goal cannot be met in production today

**There is no provider key anywhere.** `apps/worker/src/runs/anthropic.ts` exists, is imported, and
**has never executed** — EPIC-032 §6 and EPIC-033 §6 both say so. A run on deployed staging is
refused with `provider_not_configured`.

So a new user on the deployed product **cannot reach a passing run at all**, in five minutes or in
five days, and no amount of onboarding changes that. This epic can build the path, test it against a
fake, and instrument it. **It cannot produce the number its goal names.**

That matters beyond this row, and it is written at the top rather than in a report nobody reads at
the right moment: **GATE 3's M3 criterion is "10 users complete a run; ≥60% of signups reach a
passing run within 5 minutes (EPIC-034)"**. That gate is unreachable while the key is unset.
EPIC-031a is the row that sets it and it needs Soroush.

**What this epic therefore is:** the path, the instrument, and a timed test that proves the path is
walkable in the time budget when a provider exists. **What it is not:** the measurement.

---

## Decisions — settled, do not re-litigate

**1. The example is chosen, never assumed. A blank prompt stays blank.**

Soroush ruled on 2026-09-14 (`docs/backlog.md`, EPIC-021a) that seeded starter bloks are **not
owed**, because an empty state "does the job **without fabricating someone's content** — which
matters on a product whose claim is that a blok holds your verbatim text".

That ruling stands and this epic does not bend it. The distinction, which is the whole of decision 1:

- **Fabricating content into *your* prompt without asking** is what was ruled out, and it stays ruled
  out. Creating a project, or a prompt, still produces something empty.
- **An example a person explicitly asks for, labelled as an example**, is a different act. Nobody's
  words are being put in their mouth; they pressed a button that said what it would do.

So the offer sits **beside** the empty state, never inside it, and what it creates is named so that
no one could mistake it for their own writing.

**2. The first run of the example fails, on purpose, and the fix is the second half.**

`docs/roadmap.md`: *pick a seeded prompt (one already has a failing check) → run → see failure → fix
→ pass*. A first run that passed would teach nothing — the product's claim is that it catches what
you did not notice, and an onboarding where nothing is ever caught is an advertisement for a
different product.

**3. An example that always passes after the fix would be a lie, and this epic will not build one.**

Whether the fixed prompt passes depends on a real model doing what it was told. That is **the
question the product exists to answer**, and a seeded path rigged to go green regardless would be
claiming an answer it did not get.

So: the path is deterministic in the **test** (the fake provider answers predictably, and the timed
assertion is about the path being walkable); it is honest in **production** (the user's second run
passes if the model complies, and if it does not, that is a true and useful thing to have learned in
four minutes). The report says which of the two any given green tick came from.

**4. Progress is derived from the database, never stored.**

The four steps are answerable from rows that already exist: is there an example prompt, has it been
run, did a run fail, has a run passed. A stored flag would be a second source of truth that can
disagree with what happened — and the one that disagrees is always the flag.

**5. `run_started` and `run_passed` are already in the closed event set and are emitted by nothing.**
This epic emits them. `run_passed` carries **seconds from signup**, computed from `users.createdAt`,
because "activated" is defined by the roadmap's own number and a number nobody can compute is not a
definition.

**6. Consent still gates every event** (EPIC-004, EPIC-017). `captureAccountEvent` already refuses
without it, and honours `DNT` and `Sec-GPC`. A person who declined analytics contributes nothing to
this measurement, and **that is correct rather than a gap to work around**.

**7. "Activated" is first passing run within five minutes of signup**, per `docs/roadmap.md`, since
EPIC-005 is cut and there is no research-backed definition to prefer.

---

## Scope

**`apps/web`**:

- an **example offer** on `/app/projects`, beside the empty state, saying what it will create;
- a server action that creates the example project, prompt, bloks and input set in one transaction,
  and lands the person on the runs page ready to press Run;
- a **progress indicator** on the example prompt's pages, four steps, derived (decision 4);
- `run_started` on trigger and `run_passed` on a run that finishes with no failures, the latter
  carrying seconds from signup;
- `captureAccountEvent` gains an optional properties argument — `captureEvent` already takes one and
  the account-scoped wrapper is the only caller that cannot pass any.

**`packages/core`** — nothing. The example's text is content, not logic.

**`packages/db`** — no migration. Everything needed is derivable (decision 4).

## Out of scope

- **Five real users observed.** `docs/roadmap.md`'s Review line. Soroush's standing instruction of
  2026-09-15 is that human-only rows are skipped while the product is built; this is one, and the
  report says so in its own numbered section rather than leaving an unticked box.
- **The measurement itself.** See the top of this file. Blocked on EPIC-031a.
- **A dashboard panel in the product.** `docs/roadmap.md` says "dashboard panel"; EPIC-004 already
  owns the PostHog dashboard, and a second surface reporting the same number in the app is a
  different epic with a different reader. The event is what this epic owes.
- **Templates, plural.** The roadmap says three. One is enough to walk the path, and three is three
  times the fabricated content for no extra thing learned. Deliberately narrowed, and named here so
  it is not quietly forgotten.
- **Anything on the marketing site.** EPIC-072.

## Acceptance criteria

- [ ] A signed-in person with no projects is offered an example **beside** the empty state, and the
      offer says what it will create. Creating a project or a prompt by hand still produces
      something empty — decision 1, asserted by a test that would fail if a blank prompt gained a
      blok.
- [ ] Taking the example creates a project, a prompt with bloks, and an input set, and lands on the
      runs page. One transaction: a half-made example is worse than none.
- [ ] The example is **labelled as an example** wherever it appears, so it cannot be mistaken for
      the person's own writing.
- [ ] The first run of the example fails at least one check (decision 2).
- [ ] The progress indicator shows four steps and its state is derived from the database: a test
      moves the rows and the indicator follows, with nothing stored.
- [ ] `run_started` fires on trigger and `run_passed` fires only on a run that finished with **no
      failures**, never on one that merely finished.
- [ ] `run_passed` carries seconds from signup, computed from `users.createdAt`.
- [ ] Neither event is sent when analytics consent is absent, or `DNT`, or `Sec-GPC` (decision 6).
- [ ] **The whole path is walkable in under five minutes**, asserted by a timed Playwright test
      against the fake provider: signup → example → run → see the failure → fix → run → pass.
- [ ] Every interactive element works by keyboard and at 390px (rule 12).

## Verification

```
pnpm test                         # the events, the derived progress, the elapsed time
pnpm e2e                          # the timed path
node scripts/gates.mjs ci
node scripts/drive-epic-034.mjs   # the built app, by hand, screenshotted
```

## Notes for the implementer

**1. The input set is created server-side, not uploaded.** EPIC-032 decision 1's refusals are an
*upload-surface* concern: they exist so a file a person chose cannot fail at run time. The example's
data is ours and binds by construction, so it goes in directly. Do not make a new user produce a CSV
to see their first result.

**2. The timed test must not measure the harness.** A Playwright run includes a build and a browser
start. Time the **journey**, from the first click after signup to the passing run, and say in the
report what was excluded and why.

**3. `run_passed` is not "the run finished".** EPIC-030 removed `passed` from `RunSummary` precisely
so nobody could read one boolean as the answer. Use `noFailures`, and read EPIC-030's note on why
`fullyChecked` is the other half before deciding which one gates the event.

**4. Vocabulary.** blok, check, run, Draft, Live. Never assertion, never block. "Example" is the word
for the example; it is not a "template" in any UI string, because the roadmap's "three templates" is
what decision 1 narrowed.

**5. The example's own text has to survive a check.** Write the expected blok so that
`checkKindFor` derives a kind for it — EPIC-033 found two of the eight unreachable, so an example
whose check is `not_graded` would walk the path and prove nothing. Assert the derived kind in a test
rather than trusting the phrasing.
