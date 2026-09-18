<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-054: `fortyone`, and the prompt arrives in a Python process
Stage: 5b · Depends on: EPIC-053 · Size: S

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050 to EPIC-053 and EPIC-055 set. The Tasks,
Tests and Review lines below are `docs/roadmap.md`'s, unchanged; the Goal and everything else is this
file's reading of them. `docs/roadmap.md` gives EPIC-054 no Goal line, so one is written here.

**Where it starts.** `sdks/python/fortyone/__init__.py` is EPIC-000's stub: `resolve()` calls
`on_warning("not implemented")` and returns `{"text": "", "status": "unavailable"}`. EPIC-053 already
writes the file that calls it — `41p pull --lang python` generates `prompts.py`, it passes
`mypy --strict`, and the command prints a sentence saying the runtime underneath it does not exist
yet. **This epic is the runtime under a file that already exists**, and the sentence stops being
true on the day it merges.

## Goal

A Python application holds a prompt the way a TypeScript one already does: `fortyone.resolve()`
answers from memory, disk or what the deploy bundled, never waits for the network, never raises, and
picks up a new published version in about thirty seconds — with no dependency behind it and no
second implementation of anything that has to be correct.

## The roadmap's three lines, verbatim

> **Tasks.** `fortyone.resolve()` parity; standard-library HTTP, zero dependencies (tested via
> `importlib.metadata`); `.pyi`; PyPI trusted publishing; `41prompts` alias package.
> **Tests.** Offline and stale tests; `mypy --strict` on generated bindings.
> **Review.** Divergence table vs TypeScript.

## Scope

- **`sdks/python/fortyone/`** — the real runtime. `resolve()`, `create_client()`, `configure()`,
  and a `Client` with `resolve` / `refresh` / `close`, mirroring `@41prompts/sdk`'s frozen surface
  (ADR-006 §1) under Python's own naming.
- **The three sources, in `CLAUDE.md` rule 8's order** — memory, disk, bundled — with the network as
  a background refresh that fills the first two and is never in the call path.
- **`_canonical.py` and `_verify.py`** — the content-address check. `sha256` of a canonical encoding
  that must agree with `packages/core`'s **byte for byte**, because disagreeing means every artifact
  looks tampered with. Ruling 4.
- **`_bind.py`** — `{{name}}` substitution with the three traps `packages/core/src/inputs/bind.ts`
  names: right-to-left, never rescanned, `""` is a real default.
- **`py.typed`** rather than a `.pyi`. Ruling 1.
- **`sdks/python-alias/`** — the `41prompts` distribution, which installs `fortyone-prompts` and
  nothing else. Built, never published; the shape EPIC-056 publishes rather than one it invents.
  Ruling 8.
- **`scripts/forbidden-words.mjs` learns `.py`** and gains `sdks/python/fortyone` as a root, with a
  test that proves the new root fires. Ruling 7.
- **`packages/cli`'s `PYTHON_RUNTIME_NOTE`**, which says the runtime is EPIC-054 and becomes false
  on this merge. Ruling 10.

## Out of scope

- **Publishing to PyPI.** It needs an account only Soroush can open (EPIC-006, `deferred`) and a
  public repository that does not exist (EPIC-056, not reachable — `docs/decisions/GATE-5.md`).
  Reported in its own numbered section, not faked and not a `BLOCKER`. Ruling 9.
- **A Python tab on the Connect page.** EPIC-055's Goal line is the TypeScript path; adding a second
  language to that page is a UI epic with its own mockup question, and nothing in this epic's Tasks
  line asks for it.
- **Changing `/v1`, the artifact format, ADR-005 or ADR-006.** This epic is a reader of all four.
- **Changing `packages/sdk-ts`.** Parity is measured against it; it is not adjusted to make parity
  easier. Any divergence is written down in the table the Review line asks for.
- **Changing `packages/core/src/codegen/python.ts`.** EPIC-053 measured that design against
  `mypy --strict` and it stands. This epic type-checks its output against the real runtime.
- **Async.** `resolve()` is synchronous for the reason ADR-006 §2 gives, and an `asyncio` surface is
  a second API with its own freeze.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. `py.typed`, not a `.pyi`

The roadmap's Tasks line says `.pyi`. **PEP 561 says a stub file overrides the inline annotations of
the module it shadows** — so a `.pyi` beside an annotated `__init__.py` is a second copy of every
signature, and the copy is the one a customer's `mypy` believes. When it goes stale it does not warn;
it quietly type-checks somebody's code against a function that no longer has that shape.

This repository has refused a second copy four times under four names — the env placeholders
(`apps/web/e2e/env.mjs`), `buildHashOf` (*"the failure mode of a second copy being that verification
quietly always passes"*), the publish gate (EPIC-055 ruling 5) and the bindings generator (EPIC-053
ruling 1). A `.pyi` is the same defect with a PEP number.

`py.typed` plus inline annotations delivers what the line is for — a customer's type checker sees
this package's real types — with one copy. **Named in the report as a narrowing**, and C3 proves the
marker works by type-checking a consumer against the installed package rather than against the
source tree.

### 2. `ResolveResult` is a frozen dataclass, not a `TypedDict`

EPIC-000's stub returns a `dict`. `@41prompts/sdk`'s `ResolveResult` is an interface a caller reads
with `.status`, and the generated `prompts.py` hands one straight back to a customer.

A `TypedDict` would make the Python read `result["status"]` where the TypeScript reads
`result.status` — a difference in how the *answer* is read, for no gain. A frozen dataclass gives
attribute access, is immutable like its TypeScript counterpart, narrows under `mypy --strict`, and
costs nothing: `dataclasses` is standard library.

This changes the stub's shape. Nothing depends on it — the package is unpublished and the only
caller is a file EPIC-053 generates, which already says `-> ResolveResult` and never subscripts it.

### 3. Names are Python's, and every rename is a row in the divergence table

`prompt_id`, `build_hash`, `used_defaults`, `on_warning`, `create_client`, `api_key`, `base_url`,
`cache_dir`. Two are more than a rename and are called out: **`refresh_seconds` and
`timeout_seconds`**, where TypeScript has `refreshMs` and a millisecond timeout. JavaScript timers
take milliseconds and every Python API that takes a duration — `time.sleep`, `socket.settimeout`,
`threading.Timer` — takes seconds. Carrying `refresh_ms` across would make every caller multiply by a
thousand to satisfy a convention from a language they are not using.

The Review line asks for a divergence table. `sdks/python/README.md` carries it, and a test asserts
every TypeScript public name has a row.

### 4. The canonical encoder targets ECMA-262, not Python's `json`, and a golden proves it

This is the one place a second implementation silently breaks everything, and it is not the hash —
`hashlib.sha256` is not in doubt. It is the **encoding**.

`json.dumps(1.0)` is `1.0`. `JSON.stringify(1.0)` is `1`. An artifact whose `params` carry
`{"temperature": 1.0}` would therefore hash one way in `packages/core` and another in Python, and
**the symptom is `hash_mismatch` on every artifact** — which is the warning that means *somebody
served you the wrong document*. A correctness defect that presents as a security alert is the worst
shape available.

There are four of them, and all four are real:

1. **Numbers.** JavaScript parses every JSON number as a double and prints it by `Number::toString`.
   Python keeps integers exact and formats floats by `repr`, whose exponent thresholds (1e16, 1e-5)
   are not JavaScript's (1e21, 1e-7) and whose exponent form is `1e-07` against `1e-7`.
2. **Key order.** `canonicalJson` sorts by **UTF-16 code unit**; Python sorts by code point. They
   disagree above U+FFFF.
3. **Lone surrogates.** `JSON.stringify` emits `\udXXX`; Python emits a character that cannot be
   encoded as UTF-8 at all.
4. **Non-finite values.** Both must refuse rather than write `null`, which is `canonical.ts`'s own
   stated reason for existing.

So `_canonical.py` implements ECMA-262's rules directly, and **`tests/canonical_golden.json` is
generated from Node** — the header carries the command — so the Python suite compares against what
`packages/core` actually produces rather than against what this file believes it produces.

### 5. The disk cache is the same format and the same directory as `@41prompts/sdk`'s

`<tmpdir>/41prompts-sdk/<promptId>.json`, `{"cacheVersion": 1, …}`, the artifact stored as the text
it arrived as. Two consequences, and the second is the reason:

- A container running a Node service and a Python worker shares one warm cache.
- **It is the only cheap cross-language integrity check this epic can have.** A file written by the
  TypeScript SDK is read by the Python one in the suite, and the reverse. A separate directory would
  have been safe and would have thrown that away.

Safe because nothing is trusted on the way out: the artifact is re-verified against its own content
address on every read, which `disk.ts` already does *"because a file on disk is not ours in any sense
that matters"*.

### 6. The refresh runs on a daemon thread, and a script that resolves once still exits

`@41prompts/sdk` calls `unref()` on its timer for exactly this. Python's equivalent is
`daemon=True`: a `threading.Timer` that is not one holds the interpreter open for up to thirty
seconds after `main` returns, which would make every script that resolves a prompt appear to hang.

A daemon thread is killed abruptly at exit, so a write in flight is truncated. That is why the disk
write is temp-file-plus-rename — a killed writer leaves a temp file, never a half-written cache — and
it is the same argument `disk.ts` makes for a different reason.

### 7. `sdks/python/fortyone` joins the forbidden-word roots, and the gate learns `.py`

Lesson 19, fourth application. `scripts/forbidden-words.mjs` reads `.ts` and `.tsx` only, so adding
the root without teaching it Python would scan nothing and report clean — a widened root that guards
nothing is worse than no root, because the run says a word it has not checked.

So `.py` joins `EXTENSIONS`, `stripComments` learns `#` and triple-quoted docstrings, and
`apps/web/forbidden-words.test.ts` gains a positive control that plants a forbidden word under the
new root and asserts the gate fires. Whatever else fails, fails.

### 8. The `41prompts` alias distribution is built now and published later

`packages/cli-unscoped` is the precedent: the unscoped `41p` package was built in EPIC-053 and is
unpublishable by a `prepublishOnly` that refuses outside the org. `sdks/python-alias/` is the same
shape — `name = "41prompts"`, one dependency on `fortyone-prompts`, no modules of its own — because
**the shape is what EPIC-056 publishes rather than something EPIC-056 invents** at the moment it is
also doing five other things.

### 9. PyPI trusted publishing is skipped, and the report says whose it is

It needs a PyPI account and an organisation on it (EPIC-006, `deferred` since 2026-09-14) and a
public repository to publish from (EPIC-056, not reachable per `docs/decisions/GATE-5.md`). Nothing
is pushed, so no workflow this epic wrote would ever run.

`docs/AUTONOMOUS.md`: a row whose dependency is a person is **skipped, said out loud in its own
numbered section, and never ticked**. No workflow file is written naming an organisation that does
not exist — EPIC-056's own note says an empty placeholder reads as abandoned.

### 10. `41p pull --lang python` stops saying the runtime is missing

`PYTHON_RUNTIME_NOTE` reads *"The Python runtime is EPIC-054: fortyone.resolve() returns unavailable
until it ships."* On this merge that sentence is false, and a CLI that lies about its own ecosystem
is worse than one that says nothing.

It becomes the install line — `pip install fortyone-prompts` — which is the same standing as the
Connect page's `npm install @41prompts/sdk`: the command a person will run, for a package that is not
on the registry yet because EPIC-006 is deferred. The existing test that pins the literal moves with
it.

## Acceptance criteria

- [ ] **C1.** `fortyone.resolve()` answers from **memory, then disk, then bundled**, and never waits
      for the network: a client whose HTTP is a stub that blocks for ten seconds still returns inside
      a millisecond. Verified: `tests/test_resolve.py`, with the blocking stub asserting elapsed time.
- [ ] **C2.** **It never raises**, for any argument. A fuzz over `None`, ints, objects with throwing
      `__getitem__`, non-string values, a huge prompt id and a prompt id with a path separator in it
      returns a `ResolveResult` every time. Verified: `tests/test_never_raises.py`.
- [ ] **C3.** **Zero dependencies**, asserted through `importlib.metadata.requires("fortyone-prompts")`
      being empty, **and** through a positive control proving the assertion can see a dependency when
      one is declared. `py.typed` is in the wheel and a consumer type-checks against the installed
      package. Verified: `tests/test_packaging.py`.
- [ ] **C4.** **The canonical encoding agrees with `packages/core` byte for byte** over a golden
      table generated from Node, covering integral floats, the two exponent thresholds, negative
      zero, non-ASCII keys, an astral-plane key, a lone surrogate, and every escape. Verified:
      `tests/test_canonical.py` against `tests/canonical_golden.json`.
- [ ] **C5.** **A real artifact verifies.** The fixtures `packages/sdk-ts` uses are read by the
      Python verifier and produce the same `buildHash`; a document with one byte changed is refused
      with `hash_mismatch`, and one that is intact but is not what the marker names is refused too.
      Verified: `tests/test_verify.py`.
- [ ] **C6.** **Offline.** With no network at all, a client with `bundled=` resolves; a client with a
      warm disk cache resolves; a client with neither returns `status="unavailable"`, `text=""` and
      warns `not_found`. No exception in any of the three. Verified: `tests/test_offline.py`.
- [ ] **C7.** **Stale.** A cached entry older than `refresh_seconds` is answered from cache
      **immediately** while a refresh runs behind it, and the next call sees the new version. A
      conditional request carrying the stored `ETag` that answers 304 leaves the entry alone.
      Verified: `tests/test_stale.py`.
- [ ] **C8.** **Variable binding is core's rules.** A value containing `{{other}}` is inserted and not
      rescanned; a long value does not shift a later substitution; `""` is a real default and a
      missing required name returns `unavailable` with the name in `missing` rather than shipping
      `{{name}}`. Verified: `tests/test_bind.py`, each trap named.
- [ ] **C9.** **The disk cache is byte-compatible with `@41prompts/sdk`'s.** A record written by the
      TypeScript SDK is read by Python, and a record written by Python is read by TypeScript — both
      directions, both asserted, in `sdks/python/tests/test_disk.py` and
      `packages/sdk-ts/src/disk.test.ts`. A prompt id that is not a safe filename never reaches a
      path.
- [ ] **C10.** **`mypy --strict` passes over the generated bindings against the real runtime** —
      EPIC-053 checked them against the stub. The golden `prompts.py` is type-checked with `fortyone`
      importable, plus a negative control proving the check fails on a wrong argument type. Verified:
      `uv run --with mypy mypy --strict`.
- [ ] **C11.** **`mypy --strict` passes over `fortyone` itself**, and `ruff`-free: no lint tool is
      added, but the package is checked by the type checker the roadmap already names.
- [ ] **C12.** **Telemetry is off by default** and, when on, adds exactly one header to a request that
      was already happening — never a request of its own. Asserted by a stub that counts requests in
      both modes. Verified: `tests/test_telemetry.py`.
- [ ] **C13.** The `41prompts` alias distribution exists, declares `fortyone-prompts` as its only
      dependency, ships no module of its own, and builds. Verified: `tests/test_alias.py` over the
      manifest, and `uv build`.
- [ ] **C14.** `sdks/python/fortyone` is in `scripts/forbidden-words.mjs`'s roots, the gate reads
      `.py`, **a test proves it fires on a planted string under that root**, and `pnpm
      forbidden-words` passes. Verified: `apps/web/forbidden-words.test.ts` and the gate.
- [ ] **C15.** `41p pull --lang python` prints the install line and no longer says the runtime is
      missing. Verified: `packages/cli/src/commands/pull.test.ts`.
- [ ] **C16.** `sdks/python/README.md` carries the **divergence table**, and a test asserts every
      name in ADR-006 §1's frozen surface has a row in it. Verified: `tests/test_divergence.py`.
- [ ] **C17.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.
- [ ] **C18.** **The drive**: against the built app, a fresh throwaway user, a project and a prompt
      created **through the product's own UI**, published, a key minted through the keys page, then
      `41p pull --lang python` in a scratch directory and **the generated `prompts.py` executed by a
      real Python interpreter against the running server** — resolving the real published prompt,
      with `mypy --strict` over the file, a second publish picked up by the background refresh, and
      the whole run screenshotted into `docs/epics/reports/screenshots/EPIC-054/`.

## Verification

```
uv run --project sdks/python pytest -q
uv run --with mypy --project sdks/python mypy --strict fortyone
pnpm --filter @41prompts/cli test
pnpm --filter @41prompts/sdk test
pnpm forbidden-words
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-054.mts      # against the BUILT app, see its header
```

## Notes for the implementer

- **The encoding is the epic.** Everything else is a transliteration of code that already exists and
  is commented. `_canonical.py` is the one file where being 99% right produces a package that refuses
  every artifact it is given. Write the golden first.
- **`packages/core/src/artifact/canonical.ts` and `inputs/bind.ts` carry the arguments**, not just
  the code. Port the reasoning into the Python docstrings; do not summarise it away.
- **The regex is not `\s`.** JavaScript's `\s` and Python's `\s` are different sets — Python matches
  `\x1c`–`\x1f` and `\x85`, JavaScript matches `﻿`. `occurrencesInText`'s pattern must be
  spelled out explicitly or `{{ name }}` will parse differently in the two languages.
- **Offsets.** Core's are UTF-16 code units and Python's are code points. That is fine — binding only
  needs its own offsets to be self-consistent — but say so where it could mislead.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fifth copy.
- **After rebuilding, prove the server is the build you just made** — `apps/web/.next/BUILD_ID`
  appears verbatim in the HTML. Lesson 17.
- **No named inner function inside a `page.evaluate`** in a `.mts` drive. Lesson 9.
- **Every absence assertion needs a positive control.** C2, C3, C9, C10, C12 and C14 are all absence
  assertions, and this is the seventh epic in a row to have to say so.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking.
- **EPIC-057 is next and is buildable except its external review hour.** EPIC-056 is not reachable —
  `docs/decisions/GATE-5.md` says why, and a run that reaches it writes a `BLOCKER`.
