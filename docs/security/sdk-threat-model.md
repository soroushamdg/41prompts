# Threat model — the delivery path

**EPIC-057, 2026-09-17. Written by Claude Code. Not reviewed by anyone yet** — `docs/roadmap.md`'s
Review line for this epic is *"Every high finding has an owner and an epic"*, and §8 is the list of
rows Soroush has to paste. The Tasks line also asks for *"one external review hour"*; §5 and §9 say
plainly that it has not happened.

**Scope: one path.** The route a **published prompt** takes from `publish_events` to a model call
inside somebody else's process. Four HTTP routes, two SDKs in two languages, a disk cache, five
package names on two registries, and a content address that a great deal of code treats as though it
were a signature.

**Out of scope, because it is somewhere else.** A user's **provider key** is
`docs/security/byo-key-threat-model.md` (EPIC-043) — the one thing in the database that can spend
somebody's money. Prompts, runs and email addresses are `/legal/privacy` and EPIC-017's retention
work. This document does not restate either.

**The companion document was written before a single key was stored.** This one is written *after*
the path it models is built and driven, which is the opposite position and worth saying: every
finding below was checked against running code, and four of them were found by doing so rather than
by reasoning about it.

---

## 1. What is being protected, and from what

Two assets, and they fail in opposite directions.

**The API key** (`41p_live_…` / `41p_test_…`) is a bearer credential that reads a project's published
prompts. Whoever holds it can list a project's prompts, read every Live marker and fetch every build
— which is a **confidentiality** loss: a prompt is often the most commercially specific thing a team
has written. It cannot spend money, cannot write, cannot publish, and cannot reach anything outside
its own project.

**The prompt text a customer's process ends up with** is the other, and it is the more serious one.
It is an **integrity** asset. A prompt is instructions to a model, so substituting it is arbitrary
instruction injection with our name on the delivery mechanism — and unlike a leak, the victim is the
customer's end users rather than the customer.

The asymmetry runs all the way through this document. **A stolen key reads prompts. A substituted
build writes them.**

### Trust boundaries

| boundary | what crosses it | who can see it |
|---|---|---|
| customer's process → `/v1` | the API key, in `Authorization`, over TLS | our web container |
| `/v1` → the customer | a 302 naming where the bytes are | any cache in between |
| CDN / `/v1/blob` → customer's process | the marker and the build, **unauthenticated** | anybody at all — by design (ADR-005 §1) |
| customer's process → its own disk | the build, as the text it arrived as | **anyone who can write that directory** — finding 3 |
| customer's process → the model | the compiled prompt with variables bound | the provider |
| `41p link` → `.41prc` | the project id and base URL, **never the key** | the customer's repository |

**The key crosses exactly one boundary and is dropped at the second.** `fetch` strips
`Authorization` on a cross-origin redirect and `urllib` does not; both are now measured
(`packages/sdk-ts/src/redirect.test.ts`, `sdks/python/tests/test_network.py`), and finding 1 has the
numbers.

### What is deliberately not defended against

Stated so that no mitigation below reads as stronger than it is.

- **A build is public.** ADR-005 §1: *"anything in an artifact is public"*. It is served with no
  session because a CDN in front of R2 has none. A content address is not a secret, and anyone told
  one can fetch the bytes. `packages/core`'s `leak.test.ts` exists because of this.
- **Our own infrastructure.** Anyone with root on the box can serve whatever they like and the
  content address will agree with it, because they can compute it. There is no signing key held
  anywhere else. Finding 3.
- **A process running as the same user as the SDK.** It can write the disk cache and we cannot tell.
  That is inherent to a cache in a filesystem.
- **A customer who points `baseUrl` at something hostile.** Their configuration, their decision.
- **Traffic analysis.** How often a process refreshes, and therefore roughly how many prompts it
  holds, is visible to anything on the path. Accepted; it is a request count.

---

## 2. The design being modelled

- **`/v1/prompts`** — key-authenticated, scoped to the key's own project. The project comes from the
  key rather than from a parameter, so there is no parameter to get wrong.
- **`/v1/marker/:promptId`** — key-authenticated; 404 for a prompt in this key's project that was
  never published, **403** for one in another project. Redirects to where the marker bytes are.
  `max-age=30`, the one mutable document in the system.
- **`/v1/build/:buildHash`** — key-authenticated, **no project check**, deliberately: a `buildHash`
  is a SHA-256 content address of a public object, and the 404 is asked of `publish_events` rather
  than of the store. `max-age=31536000, immutable`.
- **`/v1/blob/<key>`** — **no authentication**, and only present when the store is the database
  because there is no R2 bucket and no CDN. Serves the headers the row carries and answers
  `If-None-Match` from an ETag derived from the **body**.
- **`@41prompts/sdk`** and **`fortyone`** — memory → disk → bundled, with the network as a background
  refresh that fills the first two. Never block, never raise. Every document is re-verified against
  its own content address on arrival *and* on every read from disk.
- **Rate limits (EPIC-057)** — `apps/web/lib/deploy/v1-limits.ts`. Per key for an authenticated
  request, per hashed address for one without a usable key, and a separate budget for `/v1/blob`,
  which has no key to bucket by.

---

## 3. Findings

Severity is about **what happens if the mitigation fails**, not about likelihood alone — the same
scale `byo-key-threat-model.md` uses. `high` means somebody else's money, somebody else's credential,
or a model call made on text we did not publish. `built` means it is in this commit; `owed` means it
is not and §8 has the row.

### Finding 1 — key theft · **medium** · mitigated

**The threat.** The API key is a bearer credential in a header on every refresh. Anywhere it is
written down, logged, or forwarded is a place it leaks from.

**What is built.**

- **`41p link` never writes the key.** `.41prc` holds the project id and the base URL; the key comes
  from `FORTYONE_API_KEY`. A credential in a file that looks like configuration is a credential in a
  commit.
- **It is dropped on a cross-origin redirect.** `fetch` does this; `urllib` does **not**, and
  `/v1/marker` redirects. EPIC-054 measured stock `urllib` forwarding it to a second origin —
  `first host got authorization: True`, `second host got authorization: True` — and
  `_DropAuthOnCrossOrigin` is the fix. EPIC-057 measured the TypeScript side for the first time:
  the second origin receives `(absent)`, with a same-origin redirect as the control.
- **It is never in a URL**, a query string, a cookie or `localStorage`.
- **The bucket a rate limit counts it under is the key's `id`**, not the key. A bucket is a `Map` key
  held in memory for an hour.
- **The row stores only a SHA-256 and `last_four`.** There is no column a plaintext key could sit in,
  and `apiKeyForPlaintext` is an indexed lookup on the digest rather than a scan-and-compare, so
  there is no row-by-row comparison for a timing side channel to live in.
- **A revoked key resolves to nothing** and is indistinguishable from a wrong one — "that key used to
  work" is information about our side of the relationship.

**Residual.** A key in a customer's CI logs, shell history or `docker inspect` output is theirs to
manage and we cannot see it. The blast radius is read access to one project's published prompts;
`environment` (`test` / `live`) is in the plaintext so a key pasted into the wrong configuration is
visible to whoever reads that configuration.

### Finding 2 — marker tampering · **medium** · mitigated, with one residual that is a product feature

**The threat.** The marker is the one mutable document: it says which build is Live. Change it and a
process resolves a different prompt. It is served with `max-age=30` from a cache we do not control.

**What is built.** A marker names a `buildHash`, and the build it names is verified against **that
hash** — so a marker cannot name arbitrary content, only content whose address it states. Both SDKs
also refuse a marker whose `promptId` is not the one they asked for, which catches a bucket prefix
serving another environment's markers. `apps/web/lib/deploy/artifact-substitution.test.ts` proves
both through the real routes.

**The residual, and it is deliberate: there is no rollback protection.** A replayed *old* marker
pins an application to an older published version, and nothing detects it — no monotonic version
counter, no freshness proof. **That cannot be fixed without breaking Undo**, which is a product
feature: `CLAUDE.md` rule 9 and EPIC-051 both have Publish anyway / **Undo**, and an Undo moves Live
*backwards*. An SDK that refused a lower version would refuse the feature. So a client accepts
whatever version the marker states, and what bounds the damage is that the marker came from an
authenticated endpoint over TLS and the build it names is content-addressed. **A replay serves a
prompt we really did publish, at a moment we did not choose.**

### Finding 3 — build substitution · **high** · **partly mitigated, and the TypeScript half is owed**

**This is the finding this epic exists to have found, and it has two halves.**

**The threat, stated exactly.** `buildHash` is a SHA-256 of the build's own canonical encoding. It is
a **content address, not a signature**. Re-deriving it proves a document is *intact*; it proves
nothing about *whose* it is. Anyone who can place bytes where an SDK reads them can write any text
they like, compute the matching `buildHash` themselves, choose the `promptId`, and produce a document
that passes **every check either SDK makes**. The result is a prompt of a stranger's writing sent to
a customer's model, with no warning anywhere. It is prompt injection with no model involved,
delivered through a file.

`disk.ts` says *"a file on disk is not ours in any sense that matters"* and re-verifies accordingly.
The sentence is right and the conclusion drawn from it was too weak.

**Where the bytes can be placed.** The disk cache, `<tmpdir>/41prompts-sdk/`. Measured 2026-09-17:

| | `tmpdir()` | mode | so |
|---|---|---|---|
| **Linux** (and every container) | `/tmp` | `1777` | world-writable and sticky. The sticky bit stops another user *deleting* our directory once it exists; it does nothing to stop them **creating it first**, and whoever creates it sets its mode. |
| **macOS** | `/var/folders/…/T` | `700` | already private per user. The exposure is a Linux one — which is where this ships. |

And the fix that does not work on its own: `mkdir(mode=0o700)` **does nothing to a directory that
already exists.** An attacker-created `0777` stays `0777`, measured. The mode argument is not the
control; the `stat` afterwards is.

**What is built, in `fortyone`.** The directory is created `0o700` *and* checked before a byte is
read: not owned by this user, or writable by group or other, and the cache is refused with a `disk`
warning. Never an exception — memory and bundled are untouched, which is what makes failing closed
safe here. Windows has no `getuid` and no POSIX mode bits, so the check is skipped there and that is
written down rather than implied. Eight tests, each with a control, including one that forces the
ownership case by moving the uid because nobody can `chown` without root.

**What is owed, in `@41prompts/sdk`, and the reason is a budget.** ADR-006 §1 caps the package at
15 KB minified and §6 settles that it is the minified bytes. Measured:

| variant | minified | against the 15,360 budget |
|---|---|---|
| baseline, as EPIC-054 left it | 15,121 | **239 spare** |
| + the cache-directory check, written as tightly as it honestly can be | 15,411 | **51 over** |
| + a 429 back-off and a body-size refusal as well | 16,304 | 944 over |
| + a streaming body reader, the only version that bounds the allocation | 16,590 | 1,230 over |

**The cheapest single mitigation is 290 bytes and there are 239.** There is no slack to reclaim —
`client.ts` (3,450 B), `verify.ts` (1,756 B) and core's `sha256.ts` (2,178 B) and `canonical.ts`
(1,416 B) are all load-bearing and tree-shaking already drops everything else. ADR-006's own
Consequences section anticipated this and wrote the answer: *"the correct response is to measure what
got in — not to widen the number, which is a Review line."* So it was measured and the number was
left alone.

**The consequence, plainly: a Node process is the more exposed of the two SDKs, and it is the
majority.** `sdks/python/README.md`'s divergence table carries it in its own section rather than
among the naming rows. §8 has the row and it names Soroush's three options.

**What neither half fixes.** A process running as the same user can still write the cache. **Only a
signature makes a build ours rather than merely intact**, and that is a key, a distribution
mechanism, a rotation story and a format version — §7 and §8's row.

### Finding 4 — replay · **low** · accepted, and named

**The threat.** A recorded `/v1` exchange replayed later. There is no nonce, no request signing and
no timestamp in a request.

**Why it is `low`.** Everything a replay of a *read* can achieve is reading something the key already
authorises, and the key is in the replayed request — so an attacker who can replay it already has it,
and finding 1 is the real question. There is nothing to replay in the other direction: `/v1` is four
`GET`s and writes nothing.

**The replay that does matter is the marker one, and it is finding 2's residual**, where the cached
document rather than the request is what is replayed.

### Finding 5 — denial of service on the marker endpoint · **medium** · mitigated, with one half owed

**The threat.** `/v1/marker/:promptId` is called by every installed SDK on a 30-second timer for
ever, and it was **not rate limited at all** before this epic. Three separate costs: a database round
trip per request; an indexed lookup and a SHA-256 per *unauthenticated* attempt, which is what a
brute force spends; and `/v1/blob` reading a row and hashing its whole body per request, with no key
in front of it.

**What is built** (`lib/deploy/v1-limits.ts`, `lib/rate-limit.ts`):

- **Per key, 20,000 an hour**, for an authenticated request. Not per address: a customer's fleet sits
  behind one egress address and an address bucket would give forty processes the budget of one, so
  the first thing a growing customer would meet is a `429` caused by their own success.
- **Per hashed address, 60 an hour**, for a request with no usable key. Nobody legitimate is here
  without one.
- **A separate 3,000 an hour for `/v1/blob`**, which has no key to bucket by and is therefore the
  weakest-protected of the four. A CDN is what actually absorbs this and there is no CDN.
- **All four routes**, not only the one the roadmap names.
- **The count happens after authentication, never before it** — and an earlier draft of this epic
  had it the other way round. See the residual below; it is the most interesting thing in this
  finding.
- **`429` with `Retry-After`**, in `refusalResponse`'s `{ error: … }` shape so an SDK that learned to
  read `error` for a 401 does not need a second shape. **`fortyone` honours it**, process-wide,
  because the limit is per key and every prompt a client holds is behind the same key.

**What is owed.** `@41prompts/sdk` does not honour the `429` — ruling 11's budget, same table as
finding 3. Its behaviour under a limit is: warn on the `network` code with the status in the message,
keep serving from memory, ask again next interval. **No customer loses a prompt**; the cost is
requests our own endpoint refuses cheaply.

**There is also no `rate_limited` warning code, and that is not because one is forbidden.** ADR-006
§7 says adding a `WarningCode` is *"explicitly minor … the right trade against never being able to
name a new failure"*, and it costs no bundle bytes because the type is erased. It is absent because
`@41prompts/sdk` has no 429 behaviour to raise it and `test_divergence.py` holds both languages'
unions identical — so the code would be declared in the surface most customers use and never fire
there. It arrives with the behaviour, in row 057a. Until then a caller can read the fact in the
message and cannot branch on it.

**Residual.**

1. **The window store is in memory, per process.** One web container today, so it *is* the global
   counter — the moment there are two, every limit doubles. A redeploy also forgives everybody
   mid-window. Acceptable for a limit whose purpose is to bound cost and brute force rather than to
   enforce a quota somebody paid for; wrong the day it becomes a quota. §8 row 057d.
2. **`Retry-After` is not enforceable.** A client that ignores it is refused cheaply and keeps
   asking. That is the floor, not a fix.
3. **A well-formed wrong key still costs one indexed lookup**, at whatever rate the caller chooses,
   until the address bucket refuses them. Bounded by 60 an hour per address for the *refusals*, not
   for the lookups. Accepted — see below for why the alternative was worse.
4. **Nothing limits bandwidth.** A caller inside their budget can fetch the same build 20,000 times.

**And the mitigation had a defect of its own, which is worth more than the finding.** The first
version of `v1-limits.ts` refused an address that had exhausted the unauthenticated budget *before*
`keyFromRequest` ran, precisely to close residual 3. It was written, tested, committed — and then
removed, because it was a worse problem than the one it solved:

- **A pre-auth gate sees an address and nothing else.** A customer's fleet shares its egress address
  with everything else behind that NAT. So **anyone could have deliberately spent a target's sixty
  unauthenticated requests and had that customer's entire fleet refused before it was
  authenticated** — a targeted denial of service, introduced while mitigating one, against the exact
  asset this finding is about.
- **What it bounded is nearly nothing.** `keyFromRequest` answers `missing_key` with no query at all
  when there is no header, and `apiKeyForPlaintext` refuses a malformed token through
  `environmentOfPlaintext` *before* it reaches a query. Only a well-formed `41p_live_…` token costs
  a lookup, and a key is 128 bits of `randomBytes`, so guessing is not the threat — volume is, and
  the address bucket bounds volume.

It was found by asking how the browser drive would demonstrate the limit, not by a test: every test
of the pre-auth version passed, because each one was written from the same mistaken premise.
`v1-limits.test.ts`'s *"a stranger filling the address bucket"* block is the regression test, and it
names the removed function so a later edit cannot reintroduce the shape by copying an old diff.

### Finding 6 — dependency confusion · **high** · **modelled, not mitigated — the mitigation is an account**

**The threat.** Five names ship from this repository and **none is registered**:

| name | registry | shape |
|---|---|---|
| `@41prompts/core`, `@41prompts/sdk`, `@41prompts/cli` | npm | scoped, under a scope nobody holds |
| `41p` | npm | **unscoped** |
| `fortyone-prompts` | PyPI | the distribution |
| `41prompts` | PyPI | the alias, built in EPIC-054 |

Anyone may take any of them today. The unscoped ones are the dangerous ones: a scope is at least a
namespace somebody must own, and `npm install 41p` or `pip install 41prompts` currently installs
whatever a stranger decided to put there. **And one more, which is worse than the others**: the
Python *import* name is `fortyone`, and `pip install fortyone` is a plausible mistake for somebody
who read the import line rather than the install line. That name is not ours either.

**What is built, and none of it registers a name** — so this is written as three true statements and
not as a mitigation:

- **`prepublishOnly` refuses to publish outside `41prompts/41prompts`** on all **four** npm packages
  — `core`, `sdk`, `cli` and the unscoped `41p` — which makes an accidental publish from a fork
  impossible. It is a guard on *us*, not on an attacker.
- **`provenance: true`** in all four `publishConfig` blocks, so a package that does publish carries
  an attestation naming the workflow that built it.
- **Zero dependencies in every public package**, so there is no resolver to confuse on the install
  side: nothing we ship pulls a name a stranger could supply.

**The two Python distributions have no mechanical guard**, and that is worth stating rather than
letting the npm row above cover it. `prepublishOnly` is an npm lifecycle script and Python has no
equivalent; the counterpart would be a check inside a publish workflow, and **no publish workflow
exists** because EPIC-054 skipped trusted publishing (report §8) for the same deferred account.
`sdks/python/pyproject.toml` and `sdks/python-alias/pyproject.toml` each carry a `TODO(EPIC-006)`
saying the name is unregistered — a comment, which stops nobody. The practical risk today is zero
because nothing publishes at all; it becomes real on the day the first workflow does, which is
EPIC-056's, and that is the change that has to carry the check.

**Why it is not mitigated.** Registering a name needs an account on npm and on PyPI and an
organisation on each. **EPIC-006 holds all of it and has been `deferred` since 2026-09-14**, waiting
on Soroush to open the accounts and put a payment method behind the domain. `docs/AUTONOMOUS.md`: a
row whose dependency is a person is skipped and said out loud, never faked. §8 has the row and the
owner is Soroush.

**Severity is `high` because of what a squatted name does.** It is not a leak; it is arbitrary code
execution on the machine of somebody who was trying to install our SDK, under our name, before we
have ever had a chance to say otherwise. It is also the one finding here that gets **cheaper to fix
the earlier it is done** and impossible to fix retroactively.

---

## 4. Where a key or a prompt could appear, and what stops it

| place | what stops it |
|---|---|
| a `pino` log line | `packages/logger`'s value-shaped redaction, on both processes |
| a Sentry issue | `beforeSend` / `beforeSendTransaction` / `beforeBreadcrumb` |
| a PostHog property | `scrubProperties` on every `captureEvent` |
| a second origin after a redirect | `fetch` drops it; `_DropAuthOnCrossOrigin` makes `urllib` do the same. Both measured |
| a `.41prc` in a customer's repository | `41p link` writes the project id and base URL, never the key |
| a rate-limit bucket | the key's `id`, and an address is hashed before it becomes one |
| a `/v1` refusal body | names a code, never which of the two 401 reasons it was |
| a build served from a CDN | nothing — **a build is public by design** (ADR-005 §1), which is why `leak.test.ts` exists and nothing in the format names a person, an account or a cost |
| a URL or a cookie | the key is never written to one |

---

## 5. What a green build here does not prove

1. **No penetration test has been done.** Nobody has attacked this.
2. **No external reviewer has read it.** The roadmap's *"one external review hour"* has not happened
   and is §9. In particular **nobody has reviewed the hand-written SHA-256** in
   `packages/core/src/artifact/sha256.ts`, which addresses every build in the system and is now read
   by two SDKs in two languages.
3. **No package name is registered**, so finding 6 is entirely open.
4. **Nothing is signed.** Every integrity property in this document rests on a content address plus
   TLS to our own origin.
5. **None of it is deployed.** Nothing is pushed (`CLAUDE.md`), so the image build, the Coolify
   environment, Traefik, and the migrations against a real database are untested for all of it. There
   is no R2 bucket and no CDN, so the `/v1/blob` path being modelled here is the one that exists
   *because* the intended one does not.
6. **The rate limits have never met real traffic.** The numbers in finding 5 are reasoned from one
   SDK's refresh interval, not measured against a customer.

---

## 6. If a build may have been substituted

1. **Read `publish_events`.** It is the record of what this system made public: which version, which
   `buildHash`, who, when, and any Publish-anyway reason. A `buildHash` that no event names was never
   published by us.
2. **Re-derive the address of what the store is serving.** `buildHashOf` over the bytes at
   `builds/<hash>.json`. A mismatch means the object was changed after it was written.
3. **Undo**, which moves Live to the previous build and is an ordinary product action with an audit
   row, rather than deleting anything.
4. **Tell the affected customers what text their model received and when.** This is the step with no
   technical component and the only one that matters to them: a substituted prompt is instructions
   their users acted on.
5. **Rotate the project's API keys** only if finding 1 is also suspected. Substitution does not need
   a key.

There is no revocation list. A build is immutable and content-addressed, so "this hash is bad" cannot
be communicated to an installed SDK — which is finding 3's row again, from the other end.

---

## 7. Why there is no signature yet, and what would change it

A signature is the answer to finding 3 and to most of §5. It is not written here because it is four
decisions, not a function:

- **A key, and where it lives.** A private half that signs at publish time, held somewhere `web` is
  not — otherwise root on the box signs whatever it likes and nothing has changed. The same argument
  `byo-key-threat-model.md` finding 1 makes about `KEY_ENCRYPTION_SECRET`.
- **A public half, distributed.** Bundled in the SDK pins it at install time and makes rotation a
  breaking release; fetched over TLS makes the signature only as good as the TLS. Neither is wrong
  and the choice is the whole design.
- **Rotation.** A scheme whose key cannot be rotated without an outage has a key that is never
  rotated.
- **A format version.** `signature` in the artifact is an ADR-005 v2, and ADR-005 §7 is *"no longer
  cheap to reverse"* now that a published SDK reads it.

**And it collides with both packages' own constraints.** Node has `crypto.verify` and Ed25519
built in, so the TypeScript side is only a bundle-size problem — finding 3's table is the same wall.
**Python's standard library has no signature verification at all.** `hashlib` gives SHA-256, which
is why `_canonical.py` works, but Ed25519 would mean `cryptography` or `PyNaCl` — and
`fortyone`'s zero dependencies are asserted by `tests/test_packaging.py` through
`importlib.metadata.requires`, with a positive control. So 057c is not only a format decision: it
is also the first thing that would ask whether that promise or that property matters more.

**What would change it:** a customer asking, a CDN existing (so the bytes come from somewhere we do
not control), or the first real substitution. The first two are foreseeable; ADR-005's version field
is what keeps this additive.

---

## 8. Every high finding has an owner and an epic

**`docs/backlog.md` is Soroush's to edit** (`docs/AUTONOMOUS.md`, hard limits), so these are written
ready to paste rather than added. The `high` findings are **3** and **6**.

```
| EPIC-057a | Decide the 15 KB question, then land @41prompts/sdk's three EPIC-057 mitigations: private cache dir, bounded body read, 429 back-off | S | 057 | todo |
| EPIC-057b | Register the five package names on npm and PyPI, plus `fortyone` on PyPI as a defensive name | S | 006 | todo |
| EPIC-057c | Sign the build: key custody, public-half distribution, rotation, artifact v2 | M | 057, 050 | todo |
| EPIC-057d | Rate limits that survive a second web container: move the window store out of process memory | S | 057 | todo |
| EPIC-057e | External security review hour: the hand-written SHA-256 first, then this document | S | 057 | todo |
```

| row | finding | severity | owner | why it is not in EPIC-057 |
|---|---|---|---|---|
| 057a | 3 and 5, the TypeScript halves | **high** | Soroush decides, then anyone builds | ADR-006 §1's budget had 239 bytes and the cheapest mitigation is 290. Measured four ways; ADR-006 itself says measure rather than widen. **The code is written and was reverted** — the three options are: move the budget, pay for them out of `client.ts`, or ship without them. |
| 057b | 6, dependency confusion | **high** | **Soroush** | Needs an npm account, a PyPI account and an organisation on each. EPIC-006 is `deferred`. Nothing an unattended run can do, and it gets cheaper the earlier it is done. |
| 057c | 3, the part no directory permission fixes | **high** | Soroush decides the format | An ADR-005 v2 and four decisions (§7), on a format a published SDK now reads. Not a thing to start inside a threat model. |
| 057d | 5, residual 1 | medium | unscheduled | There is one web container. The finding is real the day there are two, and the seam is one function wide. |
| 057e | §5.2 | medium | **Soroush** | Needs a person who is not this run. §9. |

**If Soroush reads only one line of this document:** **057b is the one that expires.** Every other
finding can be fixed later at the same cost. A package name someone else takes first cannot be, and
the damage lands on somebody trying to install our software.

---

## 9. The external review hour did not happen

`docs/roadmap.md`'s Tasks line for this epic includes *"one external review hour"*, and the Review
line is *"Every high finding has an owner and an epic"* — §8 is the second; this section is the first,
and it is **not done**.

It needs a person who did not write the thing being reviewed. There is no such person in an
unattended run, and Soroush has declined the comparable lawyer hour (EPIC-071, `deferred`). So it is
**skipped and said out loud**, per `docs/AUTONOMOUS.md`: not attempted, not ticked, and not faked
with a self-review wearing a different name.

**What it should cover, in this order**, so the hour is not spent deciding what to look at:

1. **`packages/core/src/artifact/sha256.ts`.** A hand-written SHA-256, in production, addressing
   every build, read by two SDKs. `HANDOVER.md` has carried "nobody has reviewed the hand-written
   SHA-256" as an open item since EPIC-051.
2. **`packages/core/src/artifact/canonical.ts` and `sdks/python/fortyone/_canonical.py`.** Two
   implementations of one encoding that must agree byte for byte. Pinned by a 331-case golden
   generated from Node and by core's own frozen fixture — which is a strong test and is not a review.
3. **This document's finding 3.** Specifically: is a private cache directory plus a content address
   an adequate stand-in for a signature until 057c, or is 057c urgent?
4. **`packages/db/src/sealed-box.ts`**, if there is time — `byo-key-threat-model.md` §7 asks for the
   same hour and the two should be bought together.

`EPIC-057e` in §8 is the row.
