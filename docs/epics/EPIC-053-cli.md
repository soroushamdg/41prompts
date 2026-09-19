<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: LicenseRef-41Prompts-Proprietary
-->

# EPIC-053: `41p`, and the prompt arrives in a repository instead of a browser tab
Stage: 5b · Depends on: EPIC-052 · Size: M

**Written by Claude Code in the advisor's chair**, 2026-09-17, under `docs/PROCESS.md`'s amendment of
2026-09-15 and the precedent EPIC-040 to EPIC-043, EPIC-050, EPIC-051, EPIC-052 and EPIC-055 set. The
Tasks, Tests and Review lines below are `docs/roadmap.md`'s, unchanged; the Goal and everything else
is this file's reading of them. `docs/roadmap.md` gives EPIC-053 no Goal line, so one is written here.

**This is the first epic of Stage 5b**, opened by `docs/decisions/GATE-5.md` (Soroush, 2026-09-17,
technical reading). It is the one epic behind that gate that needs nothing from anybody else — no
account, no payment method, no lawyer.

**Where it starts.** `packages/cli` is a stub from EPIC-000: `src/bin.ts` prints a version and
nothing else is wired up, and its own README says so. Everything below is new.

## Goal

A developer holds their prompt the way they hold the rest of their code: `41p link` once, `41p pull`
into the repository, `41p check` in CI, and the file that lands is theirs — typed, committed,
reviewable in a diff, and correct about which variables the prompt actually uses.

## The roadmap's three lines, verbatim

> **Tasks.** `link` (flag, `.41prc`, key scope, interactive, fail in CI); `pull` (typed
> `prompts.ts`/`.py` by prompt id, lockfile, bundled artifacts; header "This file is yours;
> 41Prompts claims no rights in it"); `check`; `run`; `decompile <file>` (the open decompiler, no
> account); thin unscoped `41p` package wrapping `@41prompts/cli`.
> **Tests.** Golden files TS + Python; stale lockfile detected; exit codes; `41p decompile` on the
> Northwind file yields the known findings.
> **Review.** Generated code compiles under strict in a fresh project.

## Scope

- **`packages/core/src/codegen/`** — the TypeScript generator **moved** out of
  `apps/web/lib/connect/generate.ts`, plus a Python one beside it. Both pure, both golden-tested.
  `apps/web` becomes a caller rather than an owner. Ruling 1.
- **`41p link`** — writes `.41prc`, resolves the key, refuses to prompt when there is no terminal.
- **`41p pull`** — writes `prompts.ts` or `prompts.py`, a lockfile, and the bundled artifact
  documents the SDK's `bundled` option reads.
- **`41p check`** — the CI command. Is the lockfile current against what is Live, and does every
  bundled document still hash to its own address? Exit codes, and a stale lockfile detected.
- **`41p run`** — resolves a prompt, binds variables, prints the exact text a program would send.
  **It does not call a model**, and it says so. Ruling 4.
- **`41p decompile <file>`** — core's segmenter, clustering and detectors over a local file. No key,
  no account, no network. The Northwind sample's known findings are the golden.
- **The unscoped `41p` package**, wrapping `@41prompts/cli`. Neither can be published — EPIC-056 owns
  that and `prepublishOnly` refuses until the org exists — and the wrapper is still built now,
  because its shape is what EPIC-056 publishes rather than something EPIC-056 invents.
- **`packages/cli/src` joins `scripts/forbidden-words.mjs`'s roots.** Ruling 6.
- **The Connect page gains one clause** — "or run `41p pull`" — which EPIC-055 ruling 3 said would be
  the whole of the change when this shipped. With the README, which the existing test pins to it.

## Out of scope

- **`41p run` calling a model.** There is no key-authenticated run endpoint and building one is a
  public API surface with billing, rate-limit and abuse consequences. Ruling 4.
- **The Python *runtime*.** `sdks/python/fortyone/__init__.py` is a stub whose `resolve()` returns
  `unavailable`; making it real is EPIC-054. This epic generates the file that will call it, and
  says out loud what that file does today. Ruling 3.
- **Publishing anything, to npm or PyPI.** EPIC-056, and EPIC-006 before it.
- **Changing `/v1`, the artifact, the gate, or ADR-005/ADR-006.** This epic is a reader of all five.
- **A new SDK export.** ADR-006 froze that surface three epics ago. Ruling 5.
- **`41p decompile` uploading anything.** The open decompiler is local; a command that silently
  posted somebody's prompt to us would be the opposite of the thing it is for.

## Rulings taken in the advisor's chair

Each of these is logged in `docs/decisions/AUTONOMOUS.md`.

### 1. The generator moves into `packages/core`; it is not copied

`apps/web/lib/connect/generate.ts` already writes `prompts.ts`, and EPIC-055 ruling 3 committed to it
in as many words: *"when EPIC-053 ships `41p pull`, this is precisely the file it will write"*. So
the CLI must produce byte-identical output.

`CLAUDE.md` rule 11 forbids `packages/cli` importing `apps/*`, so the CLI cannot call it where it
lives. Two copies is the defect this repository has now refused three times under three names — two
copies of an env placeholder (`apps/web/e2e/env.mjs`), two copies of a hash function
(`artifact/schema.ts`'s `buildHashOf`, *"the failure mode of a second copy being that verification
quietly always passes"*), and two implementations of the publish gate (EPIC-055 ruling 5). **The copy
goes stale silently**, and here the stale one writes a file into a customer's repository.

The generator is pure TypeScript with no IO and no DOM, which is `packages/core`'s entry requirement
exactly. So it moves, `apps/web/lib/connect/generate.ts` becomes a re-export, and both callers get
the same function. **Its tests move with it** and `apps/web` keeps one that proves the page still
renders what core generates — the seam, not the algorithm twice.

### 2. The lockfile is `41p.lock.json`, and it records what was pulled, not what is Live

A lockfile that stored the current Live version would be a cache of a moving number and `41p check`
would always pass. It records the state `pull` wrote: for each prompt, its id, the version and build
hash that were Live at that moment, and the generated file's own hash.

`41p check` fetches what is Live **now** and compares. Three outcomes, three exit codes — ruling 7.

**`41p.lock.json`, not `.41plock` and not `41p-lock.json`.** It is JSON, a person will read it in a
diff, and the extension is what makes an editor and a review tool treat it as such. It sits beside
`.41prc`, which is configuration and is not JSON-suffixed because it is dotfile-shaped by convention.

### 3. Python is generated, and the command says what the Python runtime currently does

`sdks/python/fortyone/__init__.py` is EPIC-000's stub: `resolve()` returns
`{"text": "", "status": "unavailable"}` and calls `on_warning("not implemented")`. EPIC-054 makes it
real.

Three options. **Not generating Python** contradicts the roadmap's own Tests line, which asks for
golden files in both languages, and it throws away work that is done and correct — the codegen is not
the runtime. **Generating it silently** hands somebody a file that compiles, imports, runs, and
returns an empty prompt for ever; that is the `{{customer_name}}` failure with a different cause, and
EPIC-055's drive already paid for that lesson once. So: **generate it, golden-test it, and have
`41p pull --lang python` print one line saying the Python runtime lands in EPIC-054 and that
`resolve()` returns unavailable until it does.**

This is EPIC-055 ruling 3 pointed the other way. There, the file worked and the tool that was
supposed to write it did not exist, so the page wrote it. Here the file is right and the runtime
underneath it is not, so the file is written and the gap is stated rather than discovered.

### 4. `41p run` prints what would be sent. It does not call a model, and the report says why

`/v1` has four routes — `prompts`, `marker`, `build`, `blob` — and none of them runs anything.
`/api/prompts/*` is session-authenticated and belongs to the browser. So a `41p run` that executed
against a model would have to either invent a public run endpoint or call a provider directly from
the CLI.

**Both are out.** A public run endpoint spends somebody's money on an unauthenticated-by-session
credential and needs rate limiting, quota and abuse handling — a real epic, not a task inside this
one. Calling a provider from `packages/cli` puts model traffic in a public zero-dependency package
and duplicates `apps/worker`'s adapters, which `CLAUDE.md` keeps proprietary and in the worker.

**What is left is genuinely the more useful command anyway.** `41p run <promptId> --var k=v` resolves
the Live prompt, binds the variables, and prints the exact text a program would send — which is what
somebody debugging *"why did my app send that"* actually needs, and it is the one question no other
surface answers. `--json` prints the whole resolve result: version, build hash, model, missing
variables, defaults used.

**It is named in the report as a narrowing, not delivered as though it were the roadmap's word.**

### 5. The CLI fetches `/v1` itself and verifies through core. It does not widen the SDK

`@41prompts/sdk`'s `resolve()` is synchronous and answers from cache while a background timer
refreshes — the right design for a long-lived server and the wrong one for a process that runs for
400ms and exits. Reaching the network on purpose is not something its public API offers, and ADR-006
froze that API in EPIC-052.

So the CLI makes its own `/v1` requests. **But nothing about verification is reimplemented**:
`buildHashOf`, `validate`, `ARTIFACT_JSON_SCHEMA` and `ARTIFACT_SCHEMA_VERSION` are already public in
`packages/core` and are the same functions the SDK verifies with. The HTTP is thin and the part that
must be correct is shared — `CLAUDE.md` rule 1, and the same split EPIC-055 made between a page and
its gate.

### 6. `packages/cli/src` joins the forbidden-word roots

Lesson 19, and this is the third time it has applied. `scripts/forbidden-words.mjs` scanned the trees
a browser renders; EPIC-052 added `packages/sdk-ts/src` when it turned out a customer reads the SDK's
warnings in their log, **and eleven strings failed immediately**. EPIC-055 widened
`scripts/binary-files.mjs` for the same reason and caught two live cases.

A CLI's output is read by exactly the person ADR-003's vocabulary is written for, on the terminal,
more often than most of the UI. `packages/cli/src` goes in the argument list, and whatever fails,
fails.

**And a test proves the root is covered** rather than merely that the gate passes — EPIC-055 ruling 9
and criterion C19's shape. A gate widened without a positive control is a gate nobody has watched
fire.

### 7. Three exit codes, and `check` distinguishes stale from broken

`0` current · `1` stale, which is a real answer · `2` cannot answer.

The distinction is the whole value of the command in CI. **Stale** means the lockfile and Live
disagree: somebody published and this repository has not pulled. That is a legitimate build failure
with an obvious fix, and `41p check` prints it. **Cannot answer** means no `.41prc`, no key, a
refused key, or the network did not complete — and a build that fails identically for "your prompt
moved" and "your CI has no credential" teaches people to ignore both.

This is `gates.mjs`'s `PARTIAL` verdict, one repository over: *"no database here" indistinguishable
from "this code is broken"* is the failure being avoided, and it has cost this project time twice.

### 8. `link` refuses to prompt when there is no terminal, and says what flag to use instead

The roadmap says *"interactive, fail in CI"* and the failure mode it is naming is a build that hangs
on a question nobody can see. `41p link` reads the key from `--key`, then `FORTYONE_API_KEY`, then
asks — and only asks when `process.stdin.isTTY`. Otherwise it exits `2` naming both non-interactive
routes.

**The key is not written into `.41prc`.** `.41prc` holds the base URL and the project; the key stays
in the environment. A credential in a file that looks like configuration is a credential that reaches
a commit, and `41p link` writing one would be this repository shipping the thing its own threat model
(EPIC-043) exists to prevent.

### 9. The generated file's header is the roadmap's sentence, verbatim

*"This file is yours; 41Prompts claims no rights in it."* It goes in both languages' output and it is
tested as a literal.

It also **changes the header EPIC-055 shipped**, which reads *"prompts.ts — copy this into your
project."* The two are merged rather than one replacing the other: the ownership sentence is the
roadmap's and is load-bearing, and the "regenerate it when you add one" line is how a reader knows
the file is derived. `apps/web` and the CLI now emit the same header because they are the same
function — ruling 1 — so the page's wording changes in this epic and that is expected, not a
regression.

## Acceptance criteria

- [ ] **C1.** The TypeScript generator lives in `packages/core` and `apps/web/lib/connect/generate.ts`
      re-exports it. **There is one implementation**, proved by a test that the page's output and the
      CLI's output for the same rows are byte-identical — not by inspection. Verified:
      `codegen/typescript.test.ts` and `apps/web/lib/connect/generate.test.ts`.
- [ ] **C2.** `41p pull` writes `prompts.ts` whose content matches a committed golden file, carrying
      the header `This file is yours; 41Prompts claims no rights in it.` verbatim. Verified:
      `pull.test.ts` against `__goldens__/prompts.ts.txt`.
- [ ] **C3.** `41p pull --lang python` writes `prompts.py` against its own committed golden, and
      prints the sentence naming EPIC-054 as where the Python runtime lands. Verified: `pull.test.ts`.
- [ ] **C4.** **The generated TypeScript compiles under `strict` in a fresh project** — the
      roadmap's Review line — proved by a test that type-checks the golden against the SDK's
      published declarations, including a prompt whose name is not an identifier and one whose
      variable name needs quoting. Verified: `codegen/compiles.test.ts`.
- [ ] **C5.** **The generated Python passes `mypy --strict`**, the parallel claim, run over the
      golden in `sdks/python`'s own environment. If that cannot be made to run here, the criterion is
      reported unticked with the reason rather than reworded. Verified: `uv run mypy`.
- [ ] **C6.** `41p pull` writes `41p.lock.json` recording each prompt's id, version, build hash and
      the generated file's hash, and writes the bundled documents in the shape
      `@41prompts/sdk`'s `bundled` option accepts. Verified: `pull.test.ts`, plus a test that feeds
      the written documents to a real `createClient({ bundled })` and resolves from them.
- [ ] **C7.** **A stale lockfile is detected.** `41p check` exits `1` and names which prompts moved
      when Live has advanced past the lockfile, and exits `0` when it has not. Verified:
      `check.test.ts`, both directions.
- [ ] **C8.** **`check` distinguishes stale from unanswerable**: no `.41prc`, no key, a refused key
      and a network failure each exit `2` with their own sentence, never `1`. Verified:
      `check.test.ts`, one case each.
- [ ] **C9.** `41p link` writes `.41prc` with the base URL and project and **never the key**; a test
      asserts the key's plaintext appears nowhere in the file, **with a positive control** proving
      the search can find it. Verified: `link.test.ts`.
- [ ] **C10.** `41p link` with no terminal and no `--key` and no `FORTYONE_API_KEY` exits `2` naming
      both non-interactive routes, and **does not read stdin**. Verified: `link.test.ts`.
- [ ] **C11.** **`41p decompile` on the Northwind sample yields the known findings** — the
      `prototype-sample` fixture's committed end-to-end snapshot, 14 bloks and 7 findings. It makes
      no network request and needs no key, asserted by a fetch stub that fails the test if called.
      Verified: `decompile.test.ts`.
- [ ] **C12.** `41p run <id> --var k=v` prints the bound prompt text and nothing else on stdout;
      `--json` prints the resolve result; a missing variable exits `1` and names it. **The output
      states that no model was called.** Verified: `run.test.ts`.
- [ ] **C13.** Exit codes are a documented table and every command obeys it: `0` success, `1` a real
      negative answer, `2` cannot answer. Verified: `exit-codes.test.ts`, which walks every command.
- [ ] **C14.** `41p --help` lists every command, and `41p <unknown>` exits `2` with the list rather
      than a stack trace. Verified: `bin.test.ts`.
- [ ] **C15.** The unscoped `41p` package exists, depends on `@41prompts/cli`, and its `bin` resolves
      to the same entry point. Verified: a test that reads both manifests.
- [ ] **C16.** `packages/cli/src` is in `scripts/forbidden-words.mjs`'s roots, **a test proves the
      gate fires on a planted string under that root**, and `pnpm forbidden-words` passes. Verified:
      `forbidden-words` test and the gate.
- [ ] **C17.** `packages/cli` declares no runtime dependency outside `@41prompts/core`,
      `@41prompts/sdk` and Node builtins, asserted by a test over its manifest and its import graph —
      `CLAUDE.md` rule 11, and `pnpm boundaries`.
- [ ] **C18.** The Connect page names `41p pull` as an alternative to copying, and the snippet pinning
      to `packages/sdk-ts/README.md` still passes. Verified: `connect.spec.ts`, `steps.test.ts`.
- [ ] **C19.** `pnpm test`, `pnpm typecheck`, `pnpm lint` green with every package reporting, and
      `node scripts/gates.mjs ci` green on the commit.
- [ ] **C20.** **The drive**: against the built app, a fresh throwaway user, a project and a prompt
      created **through the product's own UI**, published, a key minted **through the keys page**,
      and then the real `41p` binary run against it — `link`, `pull`, `check` before and after a
      second publish, `run`, and `decompile` — with the generated file compiled by `tsc --strict` and
      the terminal output and the Connect page screenshotted into
      `docs/epics/reports/screenshots/EPIC-053/`.

## Verification

```
pnpm --filter @41prompts/cli test
pnpm --filter @41prompts/core test
pnpm --filter @41prompts/web test
pnpm e2e --grep "connect"
node scripts/gate-run.mjs
npx tsx scripts/drive-epic-053.mts     # against the BUILT app, see its header
```

## Notes for the implementer

- **The generated file is a contract with EPIC-055's drive.** `docs/epics/reports/screenshots/EPIC-055/`
  has the file the page produced. The move in ruling 1 must not change it except for the header
  ruling 9 changes deliberately.
- **`variables` is built from what the prompt *uses*, not what it declares.** EPIC-055's drive found
  that the hard way and `apps/web/lib/connect/generate.ts`'s comment carries the whole argument.
  Moving the file moves that comment; do not summarise it away.
- **The Northwind golden already exists.** `packages/core/src/detect/fixtures/snapshots/prototype-sample-end-to-end.snap.txt`
  — 15 segments, 14 bloks, 7 findings. `41p decompile` must agree with it rather than acquire a
  second snapshot of the same prompt.
- **`apps/web/e2e/env.mjs` holds the placeholders `next start` needs.** Do not write a fifth copy.
- **After rebuilding, prove the server is the build you just made** — `apps/web/.next/BUILD_ID`
  appears verbatim in the HTML. Lesson 17 cost an hour.
- **No named inner function inside a `page.evaluate`** in a `.mts` drive. Lesson 9.
- **Every absence assertion needs a positive control.** C9, C11, C16 and C17 are all absence
  assertions, and this is the sixth epic in a row to have to say so.
- **Do not seed the drive's data.** Create the project, the prompt and the bloks by clicking, per
  `docs/AUTONOMOUS.md`.
- **EPIC-054 is next and needs nothing new from Soroush until its PyPI step.** EPIC-056 is not
  reachable — `docs/decisions/GATE-5.md` says why, and a run that reaches it writes a `BLOCKER`.
