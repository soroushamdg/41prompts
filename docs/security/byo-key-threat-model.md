# Threat model — a user's provider key

**EPIC-043, 2026-09-16. Written by Claude Code. Not reviewed by anyone yet** — `docs/roadmap.md`'s
Review line for this epic is "Soroush reads it. Every high finding has an epic", and neither has
happened. §8 is the list of rows he has to paste.

**Scope: one asset.** A provider key — an Anthropic, OpenAI or Google credential that a person gives
us so their prompt can be run against a model. Everything else this system holds (prompts, runs,
email addresses) is covered by `/legal/privacy` and the retention work of EPIC-017 and is out of
scope here. This document is about the one thing in the database that can spend somebody's money.

**Written before a key is stored, which is the point.** As of this commit nothing asks for a key and
no row exists. EPIC-042 is the epic that asks. `docs/backlog.md` orders 043 before 042 deliberately.

---

## 1. What is being protected, and from what

A provider key is not personal information in the Law 25 sense, and treating it only as personal
information would understate it. It is a **bearer credential with a spending limit set elsewhere**.
Whoever holds it can:

- spend the owner's money, up to whatever cap the owner set at the provider — and most people set
  none;
- read the owner's other traffic in some providers' consoles, depending on how the key is scoped;
- impersonate the owner to that provider, so the owner's account carries whatever is done with it.

The damage is therefore financial and reputational, it lands on somebody who is not us, and **the
only remedy is revocation at the provider**. We cannot undo a spend. That asymmetry is why the
guidance in `apps/web/lib/providers/key-guidance.ts` is entirely about actions taken at the
provider's own console, and why `/legal/security` says we would tell the owner directly and
immediately, ahead of any legal duty.

### Trust boundaries

| boundary | what crosses it | who can see it |
|---|---|---|
| browser → `web` | the key, once, in plaintext over TLS, when the person pastes it | the person, our web container |
| `web` → Postgres | a `41pk1.…` envelope | anything with database access |
| Postgres → nightly dump → R2 | the same envelope | anything with R2 access, Cloudflare |
| `worker` → provider | the key, in plaintext over TLS, on every run | our worker container, the provider |
| either container → stdout / Sentry / PostHog | **nothing**, by construction (§4) | Coolify logs, Sentry, PostHog |

**The master key crosses none of these.** It is an environment value on the box, set in Coolify, and
it is in no database, no dump, no image, and no repository.

### What is deliberately *not* defended against

Stated so that nobody reads a mitigation as stronger than it is.

- **Root on the box.** Anyone with root can read the container's environment and therefore the master
  key, and can read the database. There is no key-management service, no HSM, and no enclave on a
  single Lightsail instance. Everything below assumes the box's own perimeter holds.
- **A compromised `worker` process at the moment of a run.** The key is plaintext in memory for the
  duration of a provider call. That is inherent: the provider needs the key.
- **The provider itself.** Anthropic, OpenAI and Google each hold the key by definition.
- **A malicious operator.** There is one operator. See finding 4 for what is done about that anyway.

---

## 2. The design being modelled

`packages/db/src/sealed-box.ts` and `packages/db/src/provider-keys.ts`.

- **Sealed box.** Ephemeral X25519 → HKDF-SHA256 → AES-256-GCM. Anyone with the public half can seal;
  only the secret half opens. `node:crypto` throughout — see §7 for why not libsodium.
- **Additional data binds each envelope to `(owner, provider)`**, so an envelope lifted out of one row
  and written into another stops opening.
- **The envelope is self-describing**: `41pk1.<key id>.<ephemeral public>.<nonce>.<ciphertext‖tag>`.
  The version prefix makes a v2 additive; the key id makes rotation a state rather than an outage.
- **The master key is a list.** `KEY_ENCRYPTION_SECRET` may carry several comma-separated secrets:
  the first seals, any of them opens.
- **`provider_keys` has no column a plaintext key could sit in.** `sealed`, `key_id`, `last_four`,
  and timestamps. It cascades from `users`, so deleting an account deletes the key.

---

## 3. Findings

Severity is about **what happens if the mitigation fails**, not about likelihood alone.
`built` means it is in this commit. `owed` means it is not, and §8 has the row.

### Finding 1 — master-key custody · **high** · mitigated, with one gap

**The threat.** The master key is a single value that decrypts every stored key in the system. If it
leaks, the database becomes plaintext.

**What is built.**

- It lives only in Coolify's environment for `web` and `worker`. It is in no file in this repository,
  no image layer, no migration, no dump.
- It never reaches a log: `packages/logger/src/scrub.ts` takes its literal value out of every log
  line, every Sentry event and every PostHog property, on both processes (`secretsFromEnv` reads
  `KEY_ENCRYPTION_SECRET` by name, splitting a rotation's comma list so each half is redacted).
- `packages/db/src/provider-keys.ts` refuses in words when it is unset, naming the variable, rather
  than failing three frames deeper.
- It is generated by `generateMasterKey()`, which the runbook invokes — so it is 32 bytes from a CSPRNG
  rather than something a person typed.

**The gap, and it is the reason this is `high` rather than `medium`.** `web` and `worker` get the same
Coolify environment, so **both containers hold the whole key today**, and `web` is the one exposed to
the internet. The code is already written for the split — `sealProviderKey` needs only the public
half, and `masterKeysFrom` reads `KEY_ENCRYPTION_PUBLIC_KEY` when there is no secret — so closing it
is a deployment change with no code change. It is not closed here because EPIC-042 has not yet
decided where the "test this key" button runs, and a split that the test button then has to undo
would be worse than one done once, knowingly. **Finding 1 is the first row in §8.**

**Residual.** Root on the box reads the key. Accepted, §1.

### Finding 2 — rotation · **medium** · mitigated

**The threat.** A master key that cannot be rotated without downtime is a master key that is never
rotated, so a suspected exposure becomes a permanent one.

**What is built.** The envelope names its key id; the environment holds a list; the first key seals
and any key opens. So a rotation is: prepend the new secret, redeploy, re-seal each row (an ordinary
`putProviderKey` write), remove the old secret, redeploy. Nothing is unreadable at any point, and
`masterKeyIdOfStoredRow` finds the remaining work in one query. Tested end to end in
`provider-keys.test.ts` ("opens a row sealed under an older master key while a new one seals").

**What is owed.** The re-seal step is **manual** — there is no job that walks the table, because
re-sealing needs each row's plaintext and therefore needs to open it, and writing that job before
EPIC-042 has a single row to run it against would be writing it against nothing. The runbook has the
procedure; §8 row 2 has the job. With the number of stored keys at zero and expected to stay small,
a manual re-seal is proportionate for now and stops being so at a few hundred rows.

### Finding 3 — exfiltration through logs, errors and analytics · **high** · mitigated

**The threat, and it is the likeliest one in this document.** Nobody exfiltrates a key deliberately.
A provider SDK throws an error that echoes the request it was making; a `catch` logs the whole object;
Sentry serialises the exception and posts it to a processor in the United States; the key is now in a
third party's issue tracker, indexed and searchable, and nothing anywhere said so.

This is not hypothetical for this codebase. Three `Sentry.init` call sites existed before this epic
and **not one had a `beforeSend`**. `packages/logger`'s redaction was by **path** — `token`,
`password`, `email` — which catches a secret only when the call site already named it.

**What is built.**

- `scrub.ts` matches by **value**: Anthropic, OpenAI, Google and our own key shapes, the password
  inside a connection URL, plus the literal value of every secret this deployment holds by name.
- pino runs it twice, on the merged object (`formatters.log`) and on the message arguments
  (`hooks.logMethod`), because a secret can be in either and pino keeps them apart.
- All three `Sentry.init` calls now pass `beforeSend`, `beforeSendTransaction` and `beforeBreadcrumb`
  — including the **browser** one, which matters because the browser is where the key is typed.
- `captureEvent` scrubs every PostHog property.
- **The class is guarded, not the instances**: `apps/web/sentry-hooks.test.ts` fails the build if a
  `Sentry.init` appears without the hooks.
- `provider-keys.ts` never returns the envelope in the shape a page renders, so it cannot reach a
  template, a JSON response or a log by being passed along.

**Residual, stated plainly.** A scrubber is a **safety net, not a permission**. It matches the shapes
that exist today; a provider that ships a new key format tomorrow is not matched until somebody adds
it. The call site not logging the key is still the actual defence. And the browser side matches
shapes only — a browser holds none of this deployment's literals, correctly.

### Finding 4 — insider · **medium** · partly mitigated, and honestly so

**The threat.** There is one operator, with root, with Coolify, with the database. No separation of
duties exists or can exist at this size.

**What is built**, all of which narrows accident rather than intent:

- `CLAUDE.md`'s server-access rules and `infra/ACCESS.md`: read-only by default, one command one yes
  for anything mutating, and a standing refusal to print `Config.Env` or any `.env` unfiltered. The
  agent operating the box cannot read the master key by accident.
- Drizzle Studio against staging or production goes through a **read-only role** (`infra/RUNBOOK.md`),
  so the ordinary way of looking at data cannot write.
- `last_used_at` and `rotated_at` mean "when was this key last touched" is answerable.

**What is owed, and it is the one that would actually catch intent**: nothing records *that a key was
opened*. `openStoredProviderKey` leaves no trace, so an operator opening every row leaves the same
evidence as a normal run — none. §8 row 3 is an audit row per open. It is `medium` and not `high`
because at one operator an audit log is a record for that same operator to read, which is worth
something for accident and little for intent; it becomes `high` the day a second person has access.

### Finding 5 — backup exposure · **medium** · mitigated

**The threat.** `infra/backup.sh` dumps the whole database nightly and uploads it to Cloudflare R2,
where it is kept 30 days. Lightsail snapshots are a second copy. A backup is the copy nobody is
watching, it lives with a third party, and it is the most likely way a database leaves this box.

**What is built.** The dump contains the envelope and never the key, because the column contains the
envelope and never the key. The master key is not in the database, so it is not in the dump — **a
stolen backup is not a stolen key.** Proved in `provider-keys.test.ts` against the text representation
Postgres itself emits, with a positive control so the assertion cannot pass by searching an empty
string, and again in `scripts/drive-epic-043.mjs` against a **real `pg_dump`**.

**What is owed.** The backup is not itself encrypted at rest by us — it relies on R2's own encryption
and on the bucket's access control. That was EPIC-001's decision and is unchanged; it is recorded here
because "encrypted object storage" on `/legal/security` means *theirs*, not *ours*. §8 row 4.

**Residual.** A backup taken before a rotation is readable by the **old** master key. So an old key
must be destroyed only after the backups sealed under it have aged out — 30 days. The runbook says so.

### Finding 6 — the key is over-scoped and uncapped at the provider · **high** · mitigated by words only

**The threat, and the reason it is `high`.** Everything above protects the key from us and from
whoever attacks us. None of it limits the damage if the key does leak — and the controls that would
are entirely at the provider: scope the key to one use, cap its spend, revoke it. A person who pastes
their organisation-wide, uncapped production key into 41Prompts has handed us an unbounded liability
that no encryption we write can bound.

**What is built.** `apps/web/lib/providers/key-guidance.ts`, rendered on `/legal/security` today and
beside the input by EPIC-042, from one source so the two cannot disagree. It says the three things,
each with why, and is explicit that revoking at the provider is the effective act and removing it
here is "the smaller half".

**What is owed, and it is worth being blunt: text is a weak control.** Two stronger ones exist and are
§8 row 5 — reject a key at entry that the provider's own API reports as unrestricted, and show the
key's remaining provider-side limit beside it so an absent cap is visible rather than assumed. Both
need a provider API call, which is EPIC-042's surface.

### Finding 7 — the key in flight, inside our own request · **low** · mitigated

**The threat.** The key is plaintext in the POST body when a person saves it, in the `web` process's
memory while it is sealed, and in the `worker`'s memory during a run.

**What is built.** TLS everywhere; the seal happens in the request that receives it and the plaintext
is not retained; the value is never put in a URL, a query string, a cookie or `localStorage`;
`putProviderKey` keeps only `last_four`. Node does not offer erasable memory for a `string`, so
zeroing is not available and pretending otherwise would be theatre.

**What is owed** and is EPIC-042's to build, listed here so it is not forgotten: the input must be a
password-type field with autocomplete off, and the form must not be a GET.

---

## 4. Where a key could appear, and what stops it

| place | what stops it |
|---|---|
| a `pino` log line | value-shaped redaction on both the object and the message |
| a Sentry issue (server, edge, worker) | `beforeSend` / `beforeSendTransaction` / `beforeBreadcrumb` |
| a Sentry issue (browser) | the same three, shapes only — correct, a browser holds no literals |
| a PostHog property | `scrubProperties` on every `captureEvent` |
| a database row | there is no column for it |
| a nightly dump in R2 | the row is an envelope |
| a rendered page | `ProviderKeyMetadata` has no `sealed` field to render |
| a URL or a cookie | never written to one |
| a stack trace's `cause` chain | `scrubSecrets` follows `cause` |

---

## 5. What a green build here does not prove

1. **No penetration test has been done.** Nobody has attacked this.
2. **No lawyer has read §6 or the runbook's breach section.** EPIC-071 holds the lawyer hour and is
   `deferred`.
3. **The crypto has not been reviewed by a cryptographer.** It is a standard composition of standard
   primitives, tested against tampering, binding and rotation — which is not the same as review. §7
   says what would change that.
4. **Nothing has ever been stored.** Every property above is proved against test rows.

---

## 6. If a key is exposed

The procedure is `infra/RUNBOOK.md`, "A provider key may have been exposed". The order there is not
arbitrary: **revoke at the provider first**, because it is the only step that stops the money, and
every other step can happen while it is in progress.

---

## 7. Why this is not libsodium, and what would change it

`docs/roadmap.md` says "libsodium sealed box". This is the sealed-box **construction** and not
libsodium. The reasoning, so it can be reversed on its merits:

- **An epic that writes a threat model should not widen the supply chain it is modelling.** Adding a
  dependency to the most sensitive path in the product, in the epic about protecting that path, is a
  finding against itself. `sodium-native` is a native addon needing prebuilds in a Docker image on a
  box with 3.8 GB of free VM disk; `libsodium-wrappers` is WASM with an async `ready` gate.
- **Every primitive used is OpenSSL's**, already in Node 22, already audited, and the composition —
  ephemeral X25519, HKDF over the shared secret and both public keys, then an AEAD — is what RFC 9180
  standardises as DHKEM + HKDF + AEAD. It is not a novel scheme.
- **It gains a property libsodium's sealed box does not have**: additional data binding the envelope
  to `(owner, provider)`.

**What would reverse it.** A cryptographer's review saying the composition is wrong; a requirement to
interoperate with something that speaks `crypto_box_seal`; or Node dropping X25519. The envelope's
version prefix is what makes reversing it cheap — a `41pk2.` sealed by libsodium could be opened
alongside `41pk1.` by the same dispatch that already exists.

---

## 8. Every high finding has an epic

**`docs/backlog.md` is Soroush's to edit** (`docs/AUTONOMOUS.md`, hard limits), so these are written
ready to paste rather than added. The two `high` rows are 1 and 5.

```
| EPIC-043a | Split the master key: `web` holds the public half, `worker` the secret — no code change, one env var | S | 043, 042 | todo |
| EPIC-043b | Re-seal job: walk `provider_keys` for rows on a superseded master key id and rotate them | S | 042 | todo |
| EPIC-043c | Audit row on every provider-key open, so "who read this key" is answerable | S | 042 | todo |
| EPIC-043d | Encrypt the nightly dump before it reaches R2, with the passphrase outside Coolify | S | 043 | todo |
| EPIC-043e | Refuse an unrestricted provider key at entry, and show its provider-side spend limit | M | 042 | todo |
```

| row | finding | severity | why it is not in EPIC-043 |
|---|---|---|---|
| 043a | 1, master-key custody | **high** | EPIC-042 decides where the "test this key" call runs; splitting before that could have to be undone. Code is already written for it. |
| 043b | 2, rotation | medium | Needs rows to walk. There are none. |
| 043c | 4, insider | medium | Needs an open to audit. Nothing opens a key yet. |
| 043d | 5, backup exposure | medium | Changes `infra/backup.sh` and `restore.sh`, both production infrastructure, which is on `CLAUDE.md`'s never-touch list. |
| 043e | 6, scope and cap | **high** | Needs a provider API call from the key-entry surface, which EPIC-042 builds. |

**If Soroush reads only one line of this document**: EPIC-042 must not store the first real key until
043a and 043e have been decided — not necessarily built, but decided — because both are `high` and
both are cheapest while the number of stored keys is zero.
