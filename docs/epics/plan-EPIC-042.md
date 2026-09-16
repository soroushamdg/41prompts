<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-042: three providers, the key a person brings, and the two pivots

Written 2026-09-16. `docs/epics/EPIC-042-providers-byo-keys-heatmap.md` is the epic; this is how it
gets built and in what order, with the decisions that were settled before any code was written.

## The eight decisions taken before writing code

**1. The test call runs in the worker; `web` never opens an envelope.** Settled here because
EPIC-043 §11.1 left it to this epic and made `043a` wait on it. Consequences, all deliberate:
`apps/web` gets `KEY_ENCRYPTION_PUBLIC_KEY` and can seal; `apps/worker` gets
`KEY_ENCRYPTION_SECRET` and can open; testing a **stored** key is a queued job whose verdict is
polled. `sealed-box.ts` already supports a public-only master key (`masterKeyFromPublic`), so this
is configuration, not new cryptography. A test asserts `apps/web` contains no call to
`openStoredProviderKey` or `openProviderKey`.

**2. A key is verified before it is sealed.** The save action holds the plaintext for exactly one
provider call and one `sealProviderKey`. A key the provider rejects is **not stored**. This is what
makes "invalid key → clear error" synchronous and it is why the async job exists only for keys that
are already in the database.

**3. Verification is a models-list call, over plain `fetch`, not the AI SDK.** It costs no tokens,
it is the same call at all three providers, and it needs no model id — so it cannot fail for a
reason that is about a model rather than about the key. **Google's key goes in the
`x-goog-api-key` header, never the query string**, because a `detail` derived from a failing URL
would otherwise carry the key into a message, a log and a database column in one step.

**4. `043e` is decided and not built.** "Is this key valid" is one call every provider answers;
"what is this key allowed to spend" is an organisation-scoped billing call that two of the three do
not expose to an ordinary API key. Half of it would be a control silently absent for two providers,
which is worse than EPIC-043's words on a page. The row stays open with that finding written into
it.

**5. The matrix reuses `suite_runs.comparison`.** A set of runs made together is a shared id with no
attributes of its own, which is exactly what EPIC-041 built. What changes: a comparison may hold
more than two rows, so the run detail page lists partners instead of naming one, and
`comparisonRuns` is read for the matrix.

**6. Per-provider concurrency is three different numbers for three stated reasons**, not one number
parameterised by provider. Anthropic 2, OpenAI 4, **Google 1** — the unpaid Gemini quota is the one
a person is most likely to bring, it is limited in requests per *minute*, and concurrency cannot
help with an RPM limit; it only reaches it sooner. Nothing retries a 429 in this epic.

**7. Heatmap cells are real `button`s with roving tabindex, not an ARIA grid.** `docs/design/README.md`
asks for "heatmap cells as focusable, labelled buttons"; `role="gridcell"` on a `<button>` overrides
the very role that sentence names. Row context comes from a `role="group"` per row carrying the
check's phrase, so the cell's own accessible name stays exactly `input 17, fail`.

**8. Two new dependencies, `@ai-sdk/openai` and `@ai-sdk/google`.** `CLAUDE.md`'s stack line says
"Vercel AI SDK for providers" and `@ai-sdk/anthropic` is already here; both are Apache-2.0 with the
same two transitive dependencies the existing one has. Reason goes in the commit message and the
report.

## Order of work

### 1 · `packages/db` — the catalogue, the provider names, the columns

- `constants.ts`: move `PROVIDERS` / `ProviderName` / `isProviderName` here from `provider-keys.ts`
  (zero imports — `constants.ts` is what both apps already share), and add `MODEL_CATALOGUE`,
  `catalogueModel(id)`, `modelsForProvider(p)`, `DEFAULT_MODEL_FOR`, `providerOfModel(id)`,
  and `TEST_PROVIDER_KEY_QUEUE`.
- `schema.ts`: `provider_keys` gains `enabled`, `test_requested_at`, `last_tested_at`,
  `last_test_ok`, `last_test_detail`.
- `provider-keys.ts`: `setProviderKeyEnabled`, `requestProviderKeyTest`, `recordProviderKeyTest`,
  and `openEnabledProviderKey` (opens **and** stamps `last_used_at`; returns `undefined` when the
  row is disabled, which is not the same as absent and the caller must not conflate them).
- `pnpm db:generate` → one migration.

### 2 · `apps/worker` — prices, adapters, selection, verification, concurrency

- `prices.ts`: `ModelPrice` gains `provider`; four new rows with `readOn` and `source` read on
  2026-09-16. New `prices.test.ts` asserting catalogue ⊆ price table and vice versa.
- `ai-sdk.ts`: the one place `generateText` is called, with the usage fallback and the raw-payload
  handling EPIC-031a wrote, moved rather than reimplemented. `generate` is injectable so the unit
  tests exercise our logic without pinning any provider's wire format.
- `anthropic.ts`, `openai.ts`, `google.ts`: three thin factories over it.
- `verify-key.ts`: `verifyProviderKey(provider, plaintext, fetchImpl?)` → typed verdict. Every
  `detail` goes through `scrubString` before it is returned.
- `provider.ts`: `providerForRun(db, { owner, model }, env)` — fake, then the owner's enabled key,
  then the deployment's env key, then `undefined`.
- `concurrency.ts`: `inBatches`, pure, with a test that counts the maximum in flight.
- `suite.ts`: the per-input body becomes a function; the loop runs it in batches of the provider's
  concurrency. `runSuite` takes a `SelectProvider` resolver rather than a `SelectedProvider`.
- `main.ts`: the `test-provider-key` queue.

### 3 · `apps/web` — settings, the trigger, the two pivots

- `lib/providers/verify.ts`: the web's own call into the worker's verifier — **one import, no
  duplicate** — plus the `FAKE_PROVIDER` seam, guarded the same three ways `providerFor` is.
  (`apps/web` may not import `apps/worker`, so the verifier lives where both can reach it: see
  "One open question" below.)
- `lib/providers/actions.ts`: save, enable/disable, test, remove.
- `app/app/settings/providers/`: the page, the client form, the polled "Checking…".
- `app/app/layout.tsx`: a `Settings` link in the chrome.
- `lib/runs/actions.ts`: `startRunOnEveryProviderAction`.
- `lib/runs/view.ts`: `matrixOf(runs, checks, results)` and `heatmapOf(checks, results, rowCount)`,
  both pure, both tested.
- `runs/[runId]/`: `pivots.tsx` (the ARIA tabs), `matrix.tsx`, `heatmap.tsx`.
- `packages/ui/src/runs.css`: the heatmap and matrix styles, tokens only.

### 4 · Docs, tests, gates, drive

- `docs/providers/usage-policies.md`, read on 2026-09-16 with URLs.
- e2e: `providers.spec.ts` (save, reject, toggle, remove) and additions to the results spec for the
  matrix, the pivots and the keyboard path.
- `scripts/drive-epic-042.mjs`.

## One open question the plan had to answer on the way

**Where does the verifier live, given `apps/web` may not import `apps/worker`?** Not in
`packages/core` — it does IO, and core is zero-dependency, no-DOM, no-IO by rule. Not duplicated —
a copy goes stale silently, which is the whole of `PROCESS.md`'s note on `apps/web/e2e/env.mjs`.
So it lives in **`packages/db`**, beside the key store it is about: it is the one package both
processes already depend on, it is proprietary so nothing public is widened, and the call it makes
is about a credential this package holds. `fetch` is Node 22's, so no dependency is added.

## What could go wrong, and what is done about it

| risk | what is done |
|---|---|
| The AI SDK's provider factories differ enough that one adapter silently sends nothing | A wiring test per adapter with an injected `fetch` asserting the URL the provider is actually called at |
| Concurrency makes results land under the wrong input index | The index is carried on the work item rather than read from the loop; a test runs a set out of order and asserts indices |
| The budget is breached by parallel reservations | `incrementRunBudget` is one conditional `UPDATE`; the existing reservation test stays, and a new test runs a concurrent set against an exhausted cap |
| A key reaches a log through the new paths | A test drives the save action, the job and a run through the scrubber's own hooks and greps the output |
| The heatmap is unusable at 100 inputs | Measured in the drive at the real `MAX_INPUTS`; the roadmap's 500 is unreachable and the report says so rather than implying it was tested |
