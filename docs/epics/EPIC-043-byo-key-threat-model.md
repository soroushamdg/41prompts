<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-043: the BYO-key threat model, the key store, and the breach runbook
Stage: 4 · Depends on: EPIC-004 · Size: S

**Written by Claude Code in the advisor's chair**, 2026-09-16, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 and EPIC-041 set. The Goal, Tasks, Tests and Review lines below
are `docs/roadmap.md`'s, unchanged; everything else is this file's reading of them.

## Goal

EPIC-042 is the first row in this project that stores **somebody else's credential** — a provider key
that can spend their money. This epic is what has to be true before one is stored: a written threat
model, a key store that holds ciphertext and nothing else, a redaction path that stops a key reaching
stdout, Sentry or PostHog, a breach procedure with the clocks Law 25 and PIPEDA actually impose, and
the sentence a person needs to read before they paste a key in.

## Scope

- **`docs/security/byo-key-threat-model.md`** — the threat model. Assets, trust boundaries, and the
  five classes `docs/roadmap.md` names: master-key custody, rotation, exfiltration, insider, backup
  exposure. Each one gets a severity, what is built against it, and what is owed.
- **The sealed box** — `packages/db/src/sealed-box.ts`. A user's provider key is sealed to a public
  key; only the holder of the master secret can open it. Versioned, self-describing envelope; the
  master key comes from the environment and is never in the database.
- **The key store** — `provider_keys`, one migration, and the three functions that write and read it.
  Metadata (which provider, last four, when) is readable without opening anything.
- **Redaction** — `packages/logger/src/scrub.ts`, a pure function that finds key-shaped values in
  strings and nested objects, wired into pino, into Sentry on all three runtimes, and into every
  PostHog property.
- **`infra/RUNBOOK.md`** gains a breach section: detect, contain, rotate, notify — with Law 25's
  register of confidentiality incidents and PIPEDA's record-keeping obligation named.
- **The guidance** — one copy module saying how to scope and cap a key **at the provider**, rendered
  today on `/legal/security` and next to the input by EPIC-042.

## Out of scope

- **Settings → Providers, the toggle, and the test button.** EPIC-042.
- **The OpenAI and Google adapters, the provider matrix, the heatmap.** EPIC-042.
- **Actually running a prompt with a stored key.** EPIC-042 wires the store to `providerFor`.
  Nothing in this epic reads a key back for a real call.
- **Adding backlog rows for the threat model's findings.** `docs/backlog.md` is Soroush's
  (`docs/AUTONOMOUS.md`, hard limits). Every high finding is written as a row he can paste, in the
  threat model and in the report.
- **A lawyer's read of the breach procedure.** EPIC-071 holds the lawyer hour and is `deferred`.

## The question this epic exists to answer well

**What does the master key have to be, for the store to be worth anything?**

The easy build is symmetric: one secret in the environment, AES-GCM, done. It is not wrong, and it
already defeats the threat that matters most on a single box — a stolen database dump is ciphertext.

The answer this epic takes is the roadmap's: **a sealed box**, anonymous public-key encryption, so
that sealing and opening are different capabilities held by different halves of one key.

1. **Today both containers hold the whole key**, because Coolify gives `web` and `worker` the same
   environment, so the split buys nothing yet and nothing pretends otherwise.
2. **It costs one env var to collect.** Give `web` only `KEY_ENCRYPTION_PUBLIC_KEY` and `worker` the
   secret, and a compromised web container can accept a key and can never read one back. No code
   changes — the module is written so the sealing side never needs the secret.
3. **The envelope carries a key id**, so rotation is: add the new key, re-seal, drop the old — with
   both openable in between. A symmetric design can do this too; it is written down because rotation
   is one of the five classes and an undesigned rotation is the reason old keys never get rotated.

What the sealed box is **not** doing: it is not `libsodium`'s `crypto_box_seal` and does not add
`libsodium`. It is the same construction — ephemeral X25519, a KDF, an AEAD — built from `node:crypto`
alone, plus additional data binding each envelope to the row it belongs to, which a plain sealed box
does not give. The reasoning and the thing given up are in the report and in
`docs/decisions/AUTONOMOUS.md`; this is the one choice in the epic Soroush may want to reverse.

## Acceptance criteria

- [ ] **Round trip.** A key sealed with the public half opens with the secret half and comes back
      byte-identical, for ASCII, Unicode and a 4 KiB value. Verified by a unit test in `packages/db`.
- [ ] **The envelope leaks nothing.** The sealed value contains no substring of the plaintext, has a
      version prefix, names its master key id, and is different every time the same key is sealed.
      Verified by a unit test.
- [ ] **A tampered envelope refuses to open** rather than returning wrong bytes — a flipped
      ciphertext bit, a swapped ephemeral public key, a truncated tag. Verified by a unit test.
- [ ] **An envelope cannot be moved between rows.** One sealed for owner A's `anthropic` fails to
      open as owner B's, or as owner A's `openai`. Verified by a unit test.
- [ ] **Rotation works with both keys present**: an envelope sealed under key id 1 still opens while
      the new key seals under key id 2, and an envelope whose key id is held by nobody fails with a
      named error rather than a decryption error. Verified by a unit test.
- [ ] **The store holds ciphertext only.** `provider_keys` has no column that could hold a plaintext
      key; writing one and reading the table back — including the bytes `COPY … TO STDOUT` emits,
      which is what a dump's data section is — finds the envelope and never the key. Verified by a
      database test, and again in the drive against a **real `pg_dump`**.
- [ ] **Metadata is readable without the master key.** Which provider, the last four, when it was
      added — with no secret configured at all. Verified by a database test.
- [ ] **A key-shaped value never reaches stdout.** A provider key passed as a message, as a field, or
      nested three deep inside a job payload comes out redacted. Verified by tests in
      `packages/logger` asserting on real pino JSON output.
- [ ] **The master key's own value never reaches stdout**, even when it is not key-shaped. Verified
      by a test.
- [ ] **Sentry and PostHog run the same scrubber.** `beforeSend` on web server, web client and
      worker; every PostHog property. Verified by unit tests over the hooks, and by a test that fails
      if a Sentry init in this repository has no `beforeSend`.
- [ ] **The threat model exists and is specific**: five named classes, a severity each, what is built
      and what is owed, and a pasteable backlog row for every high finding. Verified by reading it,
      and by a test that the file exists and covers the five classes named in `docs/roadmap.md`.
- [ ] **`infra/RUNBOOK.md` has a breach section** naming the containment order, the rotation
      procedure, Law 25's 72-hour-equivalent obligations and register, and PIPEDA's record-keeping.
      Verified by reading it.
- [ ] **The guidance renders today.** `/legal/security` tells a person to scope a key to this use and
      cap it at the provider, in words, before EPIC-042 gives them a box to paste into. Verified by a
      view test and in the drive.
- [ ] **Vocabulary**: no `block`, `assertion`, `label`, `pointer`, `artifact`, `promote`, `enum`,
      `sha`, `reconcile`, `override`, `drifted` in UI strings or identifiers. `pnpm forbidden-words`
      passes.
- [ ] **Keyboard and touch**: the changed page is reachable by keyboard, has no horizontal overflow
      at 390px. Verified in the drive, screenshotted.
- [ ] **The change was driven by hand against the built app**, screenshots in
      `docs/epics/reports/screenshots/EPIC-043/`.
- [ ] `node scripts/gate-run.mjs` green on the commit before it merges.

## Verification

```
pnpm test                       # db (sealed box, store), logger (scrub), web (guidance)
pnpm typecheck
pnpm lint
pnpm e2e
node scripts/gate-run.mjs       # CI parity, on the commit
node scripts/drive-epic-043.mjs # with the built app on :3000 — the script header has the commands
```

## Notes for the implementer

**1. The master key is a value, not a file.** `KEY_ENCRYPTION_SECRET` is already named in
`CLAUDE.md`'s env list and is set nowhere — there is no key to preserve compatibility with. Choose
the encoding once and write the generator into the runbook, because a key somebody has to produce by
hand is a key that gets produced badly.

**2. Nothing in this epic may make a run fail.** No provider key exists, so every code path added
here is reached by nothing in production. If the master key is unset, sealing must refuse in words
and opening must refuse in words; neither may throw a decryption error that looks like corruption.

**3. `packages/db` still does not import `@41prompts/core`** (EPIC-040's logged decision). The sealed
box is `node:crypto` and nothing else.

**4. The scrubber is on a hot path.** Every log line in both processes goes through it. Keep it to a
string test and a small set of anchored patterns, and prove the cost is not a regression rather than
assuming it.

**5. A redaction list that is only a list of field names has already failed.** `packages/logger`
redacts `token`, `password`, `email` by path. A provider key arrives inside a *message* or inside a
payload nobody named, which is why this epic adds value-shaped matching rather than three more paths.

**6. `sha` is a forbidden word in `apps/web` and `packages/ui`** (`scripts/forbidden-words.mjs`), and
so is `block`. Write "hash" and "stops" in anything under those trees.

**7. Read `apps/web/lib/site/legal.ts` before inventing a page.** `/legal/security` exists, is
rendered, and already has the shape this epic's guidance belongs in.
