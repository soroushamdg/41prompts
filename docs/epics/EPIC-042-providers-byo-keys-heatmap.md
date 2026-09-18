<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-042: three providers, the key a person brings, and the two pivots
Stage: 4 · Depends on: EPIC-031, EPIC-043 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-16, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040, EPIC-041 and EPIC-043 set. The Goal, Tasks, Tests and Review
lines below are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of them.

**This is the last row in Stage 4.**

## Goal

Today this product calls exactly one model, with a key the operator set, and shows one run's results
one way. After this epic a person brings their own key at any of three providers, runs one prompt
against all of them at once, and reads the answer two ways: by check across providers, and by input
across a run.

## Scope

- **Two adapters.** `openaiProvider` and `googleProvider` beside the existing `anthropicProvider`,
  behind the same `Provider` interface EPIC-031 declared. Vercel AI SDK, as `CLAUDE.md`'s stack says.
- **The model catalogue**, in `packages/db`'s constants — the file that already exists to hold what
  `apps/web` and `apps/worker` must agree on. Model id → provider → the words a person reads. Pinned
  ids only.
- **The price table extended**, in `apps/worker`, with a row per catalogue model carrying the
  provider, the date it was read, and the URL it was read from. A test asserts every catalogue model
  has a price row, because a model with no price does not run.
- **The key store, used.** `provider_keys` gains `enabled`, and the columns a test result needs. The
  worker selects a provider per run: the owner's key first, the deployment's environment key second,
  a refusal in words third.
- **Settings → Providers** at `/app/settings/providers`: per provider, paste a key, see the last four,
  toggle it off without deleting it, test it, remove it. `KEY_GUIDANCE_*` — EPIC-043's copy module —
  renders beside the box, which is the second render site it was written for.
- **The test call runs in the worker, never in `web`.** Saving a key tests the plaintext the person
  just pasted, before it is sealed; testing a *stored* key is a job. `web` therefore never opens an
  envelope, which is what makes threat-model row `043a` free.
- **The provider matrix.** "Run on every provider you have a key for" creates one run per provider
  sharing a `comparison` id — EPIC-041's column, reused — and the run detail page renders the
  mockup's table: rows are checks, columns are providers, cells are counts with an icon.
- **The "By input" heatmap.** A second pivot on the run detail page, behind real ARIA tabs. Cells are
  focusable, labelled `button`s ("input 17, fail"), with a shape difference as well as a colour.
- **Per-provider concurrency**, so a run against a provider that allows more than one call in flight
  does not take the sequential path's wall clock.
- **`docs/providers/usage-policies.md`** — what each provider's published terms say about running
  somebody else's prompt through their API on their key, read on a date and linked.

## Out of scope

- **Threat-model row `043e`** — refusing an unrestricted key at entry, and showing its provider-side
  spend limit. It is an M row of its own in `docs/security/byo-key-threat-model.md` §8. This epic
  **decides** it (see "Notes"), builds the call site it will need, and does not build it.
- **Rows `043b`, `043c`, `043d`** — re-seal, the open audit row, the encrypted dump. Unchanged.
- **The other four Settings tabs** — API keys, Publishing, Team, Billing. Stage 5a and Stage 6 own
  them; a tablist with one tab in it is not a tablist, so this ships as a page.
- **Streaming.** Nothing here streams and nothing needs to.
- **Raising `MAX_INPUTS`.** It is 100 and stays 100.
- **Per-provider rate limiting, retries and backoff.** Concurrency is a limit; a retry policy is a
  different epic with its own failure modes.
- **A model picker per run.** The choice is "the default model" or "every provider I have a key for".
  Choosing an arbitrary model per run is Stage 5a's Deploy page problem.

## Acceptance criteria

- [ ] **A1.** `openaiProvider` and `googleProvider` exist, implement `Provider`, and are unit-tested
      against a fake `fetch` — no test calls a real provider. Verified by
      `pnpm --filter @41prompts/worker test`.
- [ ] **A2.** Every model in the catalogue has a price row carrying `provider`, `readOn` and
      `source`, asserted by a test that fails if a model is added without one.
- [ ] **A3.** `providerForRun` prefers the owner's stored, enabled key; falls back to the
      deployment's environment key; and returns `undefined` — which is `provider_not_configured`,
      in words — when there is neither. Unit-tested for all three.
- [ ] **A4.** Opening a stored key for a run stamps `provider_keys.last_used_at`. Asserted by a test.
- [ ] **A5.** `/app/settings/providers` renders the three providers, and for each: no key, or the
      last four with the date it was stored. EPIC-043's guidance copy is on the page. Verified in the
      browser drive and by an e2e assertion.
- [ ] **A6.** Pasting a key that the provider rejects stores **nothing** and says so in a sentence
      naming the provider. Verified by an e2e test with a stub provider endpoint.
- [ ] **A7.** A stored key can be switched off and back on without being removed, and a run made
      while it is off does not use it. Verified by a unit test and in the drive.
- [ ] **A8.** Testing a stored key is a job on the worker, and `apps/web` contains no call that can
      open an envelope. Verified by a test that greps `apps/web` for the opening functions.
- [ ] **A9.** "Run on every provider" creates one run per enabled, keyed provider, all sharing one
      `comparison` id. Verified by an e2e test with three fake providers.
- [ ] **A10.** The run detail page shows the provider matrix when the run is one of several in a
      comparison: a row per check, a column per run, counts and a `StatusIcon` in every cell.
- [ ] **A11.** The run detail page has real ARIA tabs, "By check" and "By input". The "By input"
      panel is the heatmap.
- [ ] **A12.** Every heatmap cell is a `button` with an accessible name of the form
      `input 17, fail`, reachable by keyboard, and carries a **shape** difference as well as a
      colour. Opening one shows that input's detail. Verified by an e2e test that tabs to a cell and
      presses Enter, and by an axe pass.
- [ ] **A13.** A run against a provider whose concurrency is greater than one issues more than one
      call in flight, and the budget still cannot be breached. Verified by a unit test that counts
      concurrent calls against a fake and by the existing reservation tests.
- [ ] **A14.** `docs/providers/usage-policies.md` exists, names the three providers, quotes or cites
      the clause that matters for each, and carries the date it was read.
- [ ] **A15.** No provider key reaches any log sink from any of the new paths. Verified by a test
      that runs the settings action, the test job and a run through the scrubber's hooks and asserts
      the key is absent.
- [ ] **A16.** The heatmap is readable at the largest input set the product allows. `MAX_INPUTS` is
      100, so 500 — the roadmap's number — is not reachable; the report says so and gives the
      measurement at 100.
- [ ] **A17.** `node scripts/gates.mjs ci` green on the commit, with its closing "what a green here
      still does not cover" block read and quoted in the report.
- [ ] **A18.** The feature driven by hand against the **built** app, screenshotted into
      `docs/epics/reports/screenshots/EPIC-042/`.

## Verification

```
pnpm test                       # every package reports; no PARTIAL
pnpm typecheck
pnpm lint
pnpm e2e                        # needs the e2e Postgres on 55435
node scripts/gates.mjs ci       # the only CI there is
npx turbo run build --filter=@41prompts/web && pnpm --filter @41prompts/web start --port 3000
node scripts/drive-epic-042.mjs
```

## Notes for the implementer

**The two decisions EPIC-043 left for this epic, and they are decided here.**

1. **`043a` — where does the "test this key" call run?** In the **worker**. `web` seals and enqueues;
   the worker opens and calls. That means `web` never needs `KEY_ENCRYPTION_SECRET`, so the split the
   threat model asks for is one environment variable and no code change, exactly as EPIC-043 designed
   it. The cost is a polled state on the settings row rather than a synchronous answer, and that cost
   is worth paying once rather than being undone later.
2. **`043e` — refusing an unrestricted key at entry.** Not built here, and the reason is that the
   check it needs is a *different* provider call from the one this epic makes: "is this key valid"
   is a models-list call every provider answers; "what is this key allowed to spend" is an
   organisation-scoped billing call that two of the three providers do not expose to an ordinary API
   key at all. Building half of it would ship a control that is silently absent for two providers,
   which is worse than the words on the page EPIC-043 already shipped. The decision is therefore:
   **the entry path gets the validity call now and the scope call when a provider offers one**, and
   `043e` stays an open row with that finding written into it.

**A key is tested before it is sealed, and the plaintext never survives the request.** The settings
action holds it for exactly one provider call and one `sealProviderKey`. Nothing logs it, nothing
returns it, and the failure message quotes the provider's status rather than its body.

**`CLAUDE.md` rule 10 binds the heatmap.** Green and red mean pass and fail, and **pass/fail is never
shown by colour alone** — hence the shape difference the design README already asks for, and hence
every cell's accessible name carrying the word. Amber appears nowhere; nothing in a heatmap is drift.

**The matrix reuses `suite_runs.comparison` rather than inventing a table.** EPIC-041's column is a
shared id with no attributes of its own, which is exactly what a set of runs made together is. What
changes is that a comparison may now hold more than two rows, so the run detail page's "compared
with" line lists partners rather than naming one.

**A model absent from the price table does not run** (EPIC-031 decision 4), and that rule is why the
catalogue and the price table are checked against each other by a test rather than by care.

**Per-provider concurrency is safe for the budget and is not safe for anything else.**
`incrementRunBudget` is a single conditional `UPDATE`, so concurrent reservations serialise on the
row lock — that is already proved. What concurrency does change is the order results arrive in, so
the results have to carry their input index rather than rely on the loop's position.

**The drive signs in as a fresh `claude-drive-epic042-<timestamp>@example.com`** and cleans up first
and last, per `docs/AUTONOMOUS.md`. It builds its data through the product's own UI — project,
prompt, bloks, variable, CSV — because driving the creation path is part of the test.
