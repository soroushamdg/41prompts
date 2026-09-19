<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-043 report — the BYO-key threat model, the key store, and the breach runbook

**Built by Claude Code, 2026-09-16, unattended**, with the epic file written in the advisor's chair
under `docs/PROCESS.md`'s amendment of 2026-09-15 and the precedent EPIC-040 and EPIC-041 set.

Branch `epic/043-byo-key-threat-model`. Three commits, merged into local `main` with `--no-ff`.
**Nothing was pushed** (`CLAUDE.md`, "Nothing is pushed").

**Read §11 first if you read one section.** Two `high` findings are open, both cheapest to decide
now, and one of them says EPIC-042 should not store a real key until you have.

---

## 1. What this epic is, in one paragraph

EPIC-042 is the first row in this project that stores **somebody else's credential** — a provider key
that can spend their money, whose damage lands on them, and whose only remedy is revocation at a
console we do not own. This epic put the mechanism and the paper in place before one exists: a sealed
store, a redaction path, a written threat model, a breach procedure with the clocks Law 25 and PIPEDA
actually impose, and the sentence a person reads before they paste a key in.

---

## 2. The question the epic existed to answer, and the answer

**What does the master key have to be, for the store to be worth anything?**

The cheap build is symmetric — one secret, AES-GCM, done — and it already defeats the threat that
matters most on a single box: a stolen dump is ciphertext.

The answer taken is the roadmap's, a **sealed box**, and the argument is not cryptographic strength.
It is that **sealing and opening become different capabilities**, so the deployment can later hand
`web` only the public half and a compromised web container can accept a key and never read one back.
`sealProviderKey` needs no secret, and `masterKeysFrom` already reads `KEY_ENCRYPTION_PUBLIC_KEY`
when there is no secret — so that split is **one environment variable and no code change**. Today
both containers hold the whole key and nothing pretends otherwise; it is finding 1, it is `high`, and
it is §11.1 below.

The second half of the answer is the part a plain sealed box does not give: **additional data binding
each envelope to `(owner, provider)`**. An envelope lifted out of one row and written into another
stops opening. That is an insider and a database-write threat, and encryption alone does not address
it.

---

## 3. Not libsodium, which is what the roadmap names

`docs/roadmap.md` says "libsodium sealed box". This is the sealed-box **construction** —
ephemeral X25519 → HKDF-SHA256 → AES-256-GCM — built from `node:crypto`, and it adds no dependency.

- **An epic that writes a threat model should not widen the supply chain it is modelling.** Adding a
  package to the most sensitive path in the product, in the epic about protecting that path, is a
  finding against itself. `sodium-native` is a native addon needing prebuilds in a Docker image on a
  box with 3.8 GB of free VM disk; `libsodium-wrappers` is WASM behind an async `ready` gate.
- **Every primitive is OpenSSL's**, already in Node 22, already audited, and the composition is what
  RFC 9180 standardises as DHKEM + HKDF + AEAD. It is not a novel scheme. The PKCS8 and SPKI DER
  wrappings for a raw X25519 key were verified empirically before a line of it was written, not
  recalled.
- **It gains the binding above**, which `crypto_box_seal` does not have.

**This is the one choice in the epic you may want to reverse**, and reversing it is cheap by
construction: the envelope's `41pk1.` prefix is a dispatch point, so a `41pk2.` sealed by libsodium
could be opened alongside. Threat model §7 has what would change the decision.

**Nobody has reviewed the crypto.** It is tested against tampering, binding, rotation and malformed
input — 25 assertions — which is not the same as a cryptographer reading it. Threat model §5 says so.

---

## 4. The scrubber, and the thing it found on the way in

`packages/logger` redacted by **path**: `email`, `token`, `password`, `req.headers.cookie`. That
catches a secret exactly when the call site already named the field. A provider key does not arrive
that way — it arrives inside an SDK's error message, inside a job payload nobody named, three levels
into an object a `catch` logged whole.

So `packages/logger/src/scrub.ts` matches by **value**: four key shapes in one combined expression,
the password inside a connection URL, plus the **literal value of every secret this deployment holds
by name**. That last part is what redacts the master key, which is 43 base64url characters and looks
like nothing in particular — no pattern could ever find it, and a test asserts that it cannot.

**What it found: there were three `Sentry.init` call sites in this repository and not one had a
`beforeSend`.** Each was written in a different epic for a different runtime, each correct about the
thing it was added for, and nothing was looking at the set. Every event — exception, transaction,
breadcrumb — went to a processor in the United States unexamined. All three now redact, the browser
one included, because the browser is where a person **types** the key.

**The guard is on the class, not the instances.** `apps/web/sentry-hooks.test.ts` fails the build if
a `Sentry.init` appears without all three hooks. The fourth one will be written the same way the
first three were.

`scrub.ts` has **no imports at all**, which is load-bearing: it is deep-imported by
`instrumentation-client.ts`, and the package barrel would drag pino into a browser bundle.

---

## 5. Three assertions that were vacuous, caught before they were trusted

Named together because they are one failure repeated, and `docs/PROCESS.md`'s "probe the thing"
is the only reason any of them surfaced.

1. **`COPY … TO STDOUT` returns no rows through node-postgres.** The first version of the
   backup test asserted on `JSON.stringify(await db.execute(sql\`copy … to stdout\`))`, which is
   `{"command":"COPY","rowCount":1,"rows":[]}` — the copy data never reaches the client without
   `pg-copy-streams`. **That assertion passed whatever the table contained.** It now asserts on the
   text representation Postgres itself renders, and a second test writes a plaintext key into a
   temporary table and requires the same search to **find** it.
2. **A `#hex` token never equals a computed `rgb()`.** The drive's rule-10 check compared
   `--color-pass: #0b5c2e` against `getComputedStyle(...).color`, which is `rgb(11, 92, 46)`. It
   reported a clean page whatever the page did. Both sides now go through the browser's own colour
   parser, and the check first asserts it **found** six tokens — a comparison against an empty set is
   not a pass.
3. **`"".startsWith("")` is true of everything.** The drive's "there is a real user row" check.

**Every assertion about an absence now carries a positive control.** That is the rule the three of
them produce, and it is the one worth keeping.

---

## 6. The drive found two defects in the page

**6.1 The security page said "Last updated 14 September 2026" under a section written on the 16th.**
Found by *looking at the screenshot*, not by a test. `LAST_UPDATED` is shared by all four legal docs,
so bumping it would have dated terms, privacy and sub-processors to a day on which they did not
change — claiming an edit that did not happen is the same kind of inaccuracy as hiding one that did.
The security page now carries its own `SECURITY_LAST_UPDATED`; the other three keep theirs; a test
asserts both halves of that.

**6.2 The consent banner sat across the new section** in the full-page screenshot, so the first
screenshot was a picture of the banner covering the thing the epic added. The drive now declines
first, which is what a person would do anyway.

---

## 7. The e2e race the gate found, and why it is not called flaky

`node scripts/gates.mjs ci` on `ee29ed8` failed **one** test —
`runs-results.spec.ts` › "progress advances without a reload while a run is in flight". It then
passed three runs in isolation, the whole file alone, and a full 223-test local suite.

`docs/PROCESS.md` is explicit that "it passed on the retry" is not a finding, so the mechanism was
found rather than assumed:

> `inFlight` is `queued || running`, so the `progress` element **disappears** the instant a run
> reaches a terminal state. The deterministic fake makes no network call, so the worker can drain
> both inputs inside the window between the click and the server's render of the run page. When it
> does, `progress` is not "not yet" — it is already gone, and the 5s retry can only wait for
> something that will never appear.

The test's own comment asserted the queue "has not picked it up yet" and **nothing made that true**.

**The fix removes the race rather than re-rolling it.** The worker is stopped before the run is
triggered, so the run stays `queued` for as long as the test likes, and `progress` is visible because
the run is genuinely unfinished — it now also asserts "0 of 2", which a finished run could never
show. The worker is started again and the second half watches the page advance by itself over a
multi-second window, which is a **stronger** test of the actual criterion than the original.

Killing the worker mid-file is the mechanism `worker-process.ts` already documents: pg-boss survives
an ungraceful exit and the next worker picks the jobs up. EPIC-041's queue backlog came from jobs
nobody ever started a worker for, which is the opposite case.

**Stated plainly: I cannot show that this epic's changes moved the odds, and I am not claiming they
did.** The race predates this epic and one loss is not a measurement. What is settled is the
mechanism, and it is gone.

---

## 8. Acceptance criteria

| criterion | evidence |
|---|---|
| Round trip, ASCII / Unicode / 4 KiB | ✅ `sealed-box.test.ts` › "round trip" (4 cases) |
| The envelope leaks nothing; versioned; names its key id; differs each time | ✅ `sealed-box.test.ts` › "the envelope leaks nothing" (4 tests, incl. every 6-character window of the key) |
| A tampered envelope refuses to open | ✅ `sealed-box.test.ts` › "tampering" (4 tests: flipped byte, swapped ephemeral key, truncated tag, not-an-envelope) |
| An envelope cannot be moved between rows | ✅ `sealed-box.test.ts` › "an envelope is bound to its row"; and through the store in `provider-keys.test.ts` › "keeps two people's keys apart" |
| Rotation with both keys present; unknown key id named, not a decryption error | ✅ `sealed-box.test.ts` › "rotation" (3 tests); `provider-keys.test.ts` › "opens a row sealed under an older master key while a new one seals" |
| The store holds ciphertext only, in the row and in a dump | ✅ `provider-keys.test.ts` › "holds ciphertext only" **with a positive control**; and the drive's **real `pg_dump`** — see §9 |
| Metadata reads with no master key | ✅ `provider-keys.test.ts` › "reads metadata with no master key configured at all" |
| A key-shaped value never reaches stdout — message, field, three deep | ✅ `scrub.test.ts` › "real pino output" (6 tests, asserting on the JSON pino actually writes) |
| The master key's own value never reaches stdout | ✅ `scrub.test.ts` › "redacts the master key's own value, which has no shape to match on" |
| Sentry and PostHog run the same scrubber; a new init without it fails | ✅ `sentry-hooks.test.ts` (6); `posthog-server.test.ts` › "properties are redacted" (3) |
| The threat model exists, five classes, a severity each, a row per high finding | ✅ `docs/security/byo-key-threat-model.md`; `threat-model.test.ts` (10) |
| `infra/RUNBOOK.md` has a breach section naming Law 25 and PIPEDA | ✅ `threat-model.test.ts` › "the breach section of the runbook" (9) |
| The guidance renders today | ✅ `legal.test.ts` › "the provider-key guidance" (5); driven, §9 |
| Vocabulary | ✅ `pnpm forbidden-words` PASS in the gate |
| Colour: nothing paints itself pass/fail/drift | ✅ the drive, with the token lookup proved non-empty first |
| Keyboard and touch; no overflow at 390px | ✅ the drive, screenshotted at both widths |
| Driven by hand against the built app | ✅ §9 |
| `node scripts/gate-run.mjs` green on the commit | ✅ §10 |

**Nothing is ticked on the intention.** The one criterion that reads as met and is not the whole
story is "the store holds ciphertext only": it is proved for a row this drive wrote, on this machine,
against a database nothing else has ever put a key in — because nothing has.

---

## 9. The drive, against the built app

```
npx turbo run build --filter=@41prompts/web
pnpm --filter @41prompts/web start --port 3000     # with apps/web/e2e/env.mjs's placeholders
npx tsx scripts/drive-epic-043.mts
```

**27 assertions, all PASS.** Screenshots in `docs/epics/reports/screenshots/EPIC-043/`:
`01-legal-security-1440.png`, `02-legal-security-390.png`, `03-signed-in.png`.

It is `.mts` run through `tsx`, unlike the `.mjs` drives before it, because it has to seal a key with
the **real** `packages/db` module rather than a reimplementation — a drive that proved a copy would
prove nothing.

**The half that only a drive can do honestly: a real `pg_dump`.** `pg_dump` is not on this machine's
PATH; it is inside the `postgres:16` container. So the drive seals a realistic key against the real
database and then runs

```
docker exec 41p-e2e-postgres pg_dump -U 41p -d 41p --data-only --table=provider_keys
```

and greps the bytes — for the plaintext, for an eight-character fragment of it, and for the master
key — after first asserting the dump **contains the envelope**, so an empty dump cannot pass. Then
the same against a dump of the whole database.

**What the drive does not cover, stated rather than implied.**

1. **There is no UI for storing a key** — EPIC-042 builds it — so the drive seals through the store's
   own function rather than by clicking. The creation path is not driven because there is no creation
   path.
2. **The scrubbing is proved by tests, not by the drive.** With no `SENTRY_DSN` and no
   `NEXT_PUBLIC_POSTHOG_KEY` locally, no event is sent, so there is nothing to observe leaving. The
   pino half is asserted against real pino JSON output; the Sentry half is asserted by the hooks
   being present and by the function they call being tested. **Nobody has watched a redacted event
   arrive in Sentry.**
3. **The local drive cannot cover the image build, the Coolify environment, Traefik, or migrations
   against the real database.** Nothing is pushed, so none of those has happened.

---

## 10. Verification

```
pnpm test        8 checked, 8 passed   (database: throwaway container)
pnpm typecheck   8 checked, 8 passed
pnpm lint        11 checked, 11 passed
node scripts/gate-run.mjs
```

`gate-run.mjs` resolved to `gates.mjs ci`, which ran alone.

**Green on `3ce248e`, all 16 steps, 8m06s:** checkout · install --frozen-lockfile · lint · typecheck ·
db:migrate · test · playwright install · **e2e (5m21s)** · pytest · reuse lint · boundaries · turbo
boundaries · forbidden-words · binary-files · license-gate --sbom · mirror-dry-run. Re-run on the
branch tip after the report and the backlog row were written.

**What that green does not cover — its own closing block, which is part of the result:**

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and their specs skip here. A layout change can pass this run and fail on Linux (CI #206). This
   epic changes `/legal/security`'s content, so those baselines are a live concern rather than a
   formality — the landing-page baselines are unaffected, but nothing local proved that.
2. **The runner is slower than this machine.** A test that only fails under load passes here.
3. **And, since 2026-09-15, nothing catches either afterwards.** Nothing is pushed: no second machine
   built this, no image was built, nothing deployed. The first push after this gap should be expected
   to go red.

---

## 11. Open questions for Soroush

**11.1 — `high`. The master key is held whole by both containers, and `web` is the one on the
internet.** The split is one environment variable and no code change: `web` gets
`KEY_ENCRYPTION_PUBLIC_KEY`, `worker` gets `KEY_ENCRYPTION_SECRET`. It is not done here because
EPIC-042 has not decided where the "test this key" call runs, and a split that the test button then
has to undo is worse than one done once. **Threat model row `043a`.**

**11.2 — `high`. Nothing stops a person pasting their organisation-wide, uncapped production key.**
The mitigation shipped is words on a page, and text is a weak control. Two stronger ones need a
provider API call from the key-entry surface, which is EPIC-042's. **Threat model row `043e`.**

**Together, 11.1 and 11.2 are the one recommendation this report makes: EPIC-042 should not store the
first real key until both are decided — not necessarily built.** Both are cheapest while the number
of stored keys is zero, and it is zero exactly once.

**11.3 — the libsodium deviation.** §3. Reversible cheaply; recorded so it can be.

**11.4 — five backlog rows are written and not added.** `docs/backlog.md` is yours
(`docs/AUTONOMOUS.md`, hard limits), so threat model §8 has `043a`–`043e` ready to paste, each mapped
to the finding it closes and with a note on why it is not in this epic. The Review line — "Soroush
reads it. Every high finding has an epic" — is the half of this epic nobody but you can do, which is
why the backlog row says `built — awaiting Soroush's read of the threat model`.

**11.5 — the breach procedure has not been read by a lawyer.** EPIC-071 holds the lawyer hour and is
`deferred`. The Law 25 and PIPEDA obligations in it are written from the statutes' own language and
are the right shape; the clocks and thresholds are the part a lawyer would sharpen.

**11.6 — a Law 25 register now has a named home that does not exist.** The runbook says incidents go
in `docs/incidents/confidentiality-register.md`. It is not created, because creating an empty
register would be the only row in it a fiction. If you would rather it exist empty with a header, say
so.

**11.7 — nothing records that a key was opened.** Threat model finding 4. At one operator an audit
log is a record for that same operator to read; it becomes `high` the day a second person has access.
Row `043c`.

---

## 12. New dependencies

**None.** That is a deliberate property of this epic rather than an accident — §3.

---

## 13. Migrations

`packages/db/drizzle/0013_conscious_sharon_carter.sql` — creates `provider_keys` with a foreign key
to `users` on delete cascade and a unique index on `(owner, provider)`. Generated by
`pnpm db:generate`, never hand-written. Applied locally and in the gate's clean checkout.

It creates a table nothing reads in production yet. That is the point of the epic's ordering: the
store exists, is tested and is proved against a real dump **before** anything asks a person for a key.
