<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-043: the BYO-key threat model, the key store, and the breach runbook

Written before any code, per `CLAUDE.md` "How to work". Eight steps, in dependency order.

## 0. What is already there, checked rather than remembered

| thing | state |
|---|---|
| `KEY_ENCRYPTION_SECRET` | named in `CLAUDE.md`'s env list, **set nowhere** and read by nothing. `grep -rn` over the whole tree finds one hit, in `CLAUDE.md`. So there is no existing key and no compatibility to preserve. |
| `packages/db/src/api-keys.ts` | 41Prompts' **own** api keys — hashed, never stored. Not a provider key, and the precedent for "key material handling lives in `packages/db`". |
| `packages/logger` | pino with a **path**-based redaction list (`email`, `token`, `password`, cookie/authorization headers, `prompt`, `payload`). No value-shaped matching. |
| `apps/web/instrumentation.ts`, `instrumentation-client.ts`, `apps/worker/src/sentry.ts` | three `Sentry.init` calls, **none with a `beforeSend`**. |
| `apps/web/lib/analytics/posthog-server.ts` | `captureEvent` validates the event **name** against a closed set. Properties are passed through unexamined. |
| `apps/web/lib/site/legal.ts` | four legal docs including `/legal/security`, already rendered, already has "How it is built". |
| `pg_dump` | **not on this machine's PATH**. It is inside the `postgres:16` container. That decides where the dump test runs and where the drive's does. |

## 1. `packages/db/src/sealed-box.ts` — the crypto

`node:crypto` only; no new dependency.

- **Master key**: an X25519 private scalar, 32 bytes, base64url, in `KEY_ENCRYPTION_SECRET`. Raw
  bytes are wrapped into PKCS8 DER with the fixed 16-byte X25519 prefix (verified empirically before
  writing this plan) so `createPrivateKey` accepts them; the public half is derived, so one env var
  is enough today and the split into two is a deployment change with no code change.
- **Key id**: the first 8 hex of `sha256(raw public key)`. It identifies *which* master key sealed an
  envelope; it is not secret and is what makes rotation a state rather than an outage.
- **Seal**: ephemeral X25519 keypair → `diffieHellman` → `hkdfSync("sha256", shared, salt=keyId,
  info = version ‖ recipient public ‖ ephemeral public)` → AES-256-GCM with a random 12-byte nonce,
  **additional data = `41p.pk.v1|<keyId>|<owner>|<provider>`**. The ephemeral secret is used once and
  dropped, so nonce reuse is not reachable.
- **Envelope**: `41pk1.<keyId>.<ephemeral pub b64url>.<nonce b64url>.<ciphertext‖tag b64url>` — one
  text column, self-describing, greppable in a dump, versioned at the front so a v2 is additive.
- **Open**: parse, select the secret whose key id matches, recompute, `setAuthTag`, decrypt. Every
  failure is a named error (`unknown master key`, `envelope is not this shape`, `will not open`), never
  a raw OpenSSL message.
- **`generateMasterKey()`** so the runbook has a command instead of a description.

Tests (`sealed-box.test.ts`): round trip ASCII / Unicode / 4 KiB; two seals of one value differ;
envelope contains no plaintext substring; each of three tampers refuses; wrong owner and wrong
provider refuse; two keys held at once, old opens and new seals; unknown key id names itself; no key
configured refuses in words.

## 2. `provider_keys` — the store

One table, one migration (`pnpm db:generate`, never hand-written).

```
id           pk_ + 8 hex
owner        → users.id, on delete cascade
provider     'anthropic' | 'openai' | 'google'   (text + a TS union; "enum" is a forbidden word)
sealed       the envelope. The only place key material exists.
key_id       which master key sealed it — a rotation can find its own work with one query
last_four    what the UI shows instead of the key
created_at / rotated_at / last_used_at
unique (owner, provider)
```

`packages/db/src/provider-keys.ts`: `putProviderKey` (seal and upsert), `providerKeyMetadata`
(everything except the key, **no master key needed**), `openProviderKey`, `deleteProviderKey`.

Tests (`provider-keys.test.ts`, database-backed, `skipIf(!HAS_TEST_DATABASE)`): write → read back the
same key; the row's own bytes contain the envelope and not the key; `COPY provider_keys TO STDOUT`
— which is what a dump's data section is — contains the envelope and not the key; metadata reads
with `KEY_ENCRYPTION_SECRET` unset; upsert replaces rather than duplicating; delete removes.

## 3. `packages/logger/src/scrub.ts` — the redaction

Zero imports, so it is safe in a browser bundle. `scrubSecrets(value, extraSecrets?)` walks strings,
arrays, plain objects, `Error` messages and stacks; leaves everything else alone; caps depth.

Patterns, anchored and few (step 4 of the epic's notes — this is a hot path):
`sk-ant-…`, `sk-…` (covers `sk-proj-`), `AIza…`, `41p_…`, plus any literal passed in — which is how
`KEY_ENCRYPTION_SECRET`'s own value is scrubbed even though it is not key-shaped.

Wiring:
- **pino**: `formatters.log` for the merged object and `hooks.logMethod` for the message arguments.
  Both, because a message string is not in the object and an object field is not in the message.
- **Sentry** ×3: one shared `beforeSend`/`beforeSendTransaction` built on the same function.
- **PostHog**: `captureEvent` scrubs properties before `capture`.

Tests: shapes matched and not matched; nested three deep; inside an array; inside an `Error`;
the extra literal; **real pino JSON output** asserted, not the function in isolation; a test that
walks this repository's `Sentry.init` call sites and fails if one has no `beforeSend`.

## 4. The guidance

`apps/web/lib/providers/key-guidance.ts` — a small exported structure: the heading, one sentence of
why, and three actions (scope the key to this use, cap the spend at the provider, rotate or revoke
there rather than here). `legal.ts` renders it on `/legal/security`; EPIC-042 renders it by the input.
One source, two sites. A test asserts all three actions survive into the rendered page.

## 5. `docs/security/byo-key-threat-model.md`

Assets, trust boundaries, then the five classes the roadmap names, each with severity, what is built,
what is owed. Findings are numbered; every **high** one carries a backlog row written out ready to
paste, because `docs/backlog.md` is not mine to edit.

## 6. `infra/RUNBOOK.md`

New section: "A provider key may have been exposed." Contain (revoke at the provider first — it is
the only step that stops the money), assess, rotate the master key, notify. Law 25's obligations to
the Commission d'accès à l'information and to affected people, and its **register of confidentiality
incidents**, which is the part that is always forgotten; PIPEDA's breach-of-security-safeguards
record-keeping. Plus the generator command for a new master key.

## 7. Gates, the drive, the merge

`node scripts/gate-run.mjs` on the commit. Then `scripts/drive-epic-043.mjs` against the **built**
app: sign in as a fresh `claude-drive-epic043-…@example.com`, read `/legal/security` at 1440 and
390, keyboard through it, assert no horizontal overflow and no colour misuse — then seal a key
against the real database and run a **real `pg_dump` inside the Postgres container**, grepping the
output for the plaintext. That last part is the epic's whole point and is the one assertion a unit
test cannot make honestly, because `pg_dump` is not on this machine.

## What could go wrong, named in advance

1. **The deep import `@41prompts/logger/src/scrub` may not resolve** under Next's `transpilePackages`
   or under `moduleResolution: "bundler"`. Fall back to an `exports` map on the package. Decide by
   running `pnpm typecheck` and a real `next build`, not by reasoning.
2. **`sha` and `block` are forbidden words** under `apps/web` and `packages/ui`. `packages/db` is not
   scanned, so `sha256` is fine there and must not appear in the web copy.
3. **The scrubber on every log line** is a cost. Measure it rather than assert it.
4. **`pg_dump`'s version inside `postgres:16` must match the server** — it does, same image.
