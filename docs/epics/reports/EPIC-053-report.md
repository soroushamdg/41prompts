<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# EPIC-053 — report

**`41p`, and the prompt arrives in a repository instead of a browser tab.** Built 2026-09-17 on
`epic/053-cli`, nine commits, 85 files, +6,403/−562. First epic of Stage 5b, opened by
`docs/decisions/GATE-5.md`.

---

## 1. What is true now that was not true before

A developer can hold their prompt the way they hold the rest of their code.

```
export FORTYONE_API_KEY=41p_live_…      # Settings → API keys, shown once
npx 41p link
npx 41p pull
```

and `prompts.ts` lands in the repository — typed, committed, reviewable in a diff, and correct about
which variables the prompt actually uses. `41p check` in CI says whether it is still current, and
says it differently from "this job has no credential". `41p run` prints exactly what the program
would send. `41p decompile` reads a prompt file with no key and no account and no request.

**Before today `packages/cli` printed a version number and nothing else.**

---

## 2. Acceptance criteria

| # | criterion | evidence |
|---|---|---|
| C1 | One generator, `apps/web` re-exports it, proved byte-identical | `apps/web/lib/connect/generate.test.ts` — six input sets asserted equal, plus a control that the assertion can fail. And a one-off probe over 8 inputs across the move: bodies byte-identical, headers changed in all 8 (§4.1) |
| C2 | `41p pull` writes `prompts.ts` matching a golden, with the ownership sentence | `goldens.test.ts`; `packages/cli/src/__goldens__/prompts.ts.txt` |
| C3 | `--lang python` writes `prompts.py` against its own golden and names EPIC-054 | `goldens.test.ts`, `pull.test.ts` — and the control that the TypeScript pull does *not* print the note |
| C4 | The generated TypeScript compiles under `strict` in a fresh project | `apps/web/cli-generated-code.test.ts` — real `tsc`, `skipLibCheck: false`, against the SDK's **published** declarations, with a negative control |
| C5 | The generated Python passes `mypy --strict` | same file, `uv run --with mypy`, with a negative control |
| C6 | The lockfile and the bundled builds; the builds are what the SDK accepts | `pull.test.ts` — the written documents are handed to a real `createClient({ bundled })`, which resolves from them with no network and no disk |
| C7 | A stale lockfile is detected | `check.test.ts`, four kinds (moved, unpublished, added, removed), both directions |
| C8 | Stale is distinguished from unanswerable | `check.test.ts` — no config, no key, refused key, network failure, unknown lockfile version: each asserts `2` **and** asserts it is not `1` |
| C9 | `link` never writes the key, with a positive control | `link.test.ts` |
| C10 | `link` refuses with no TTY and does not read stdin | `link.test.ts`; and the packed binary, `apps/web/cli-packed.test.ts` |
| C11 | `decompile` yields the Northwind sample's known findings, offline | `decompile.test.ts` — 14 bloks, 7 findings, derived from core rather than hardcoded; `forbiddenFetch` throws if called |
| C12 | `run` prints the bound prompt, `--json`, missing variable exits 1, says no model was called | `run.test.ts` |
| C13 | Three exit codes, every command obeys | `main.test.ts` — walks every command; asserts only 0, 1, 2 are ever returned |
| C14 | `--help` lists every command; unknown command exits 2 with no stack trace | `main.test.ts`, and the packed binary |
| C15 | The unscoped `41p` wrapper | `packages/cli-unscoped/wrapper.test.ts` — including that its entry point is exactly two statements |
| C16 | `packages/cli/src` in the forbidden-word roots, gate proved to fire | `apps/web/forbidden-words.test.ts`; it found three strings on the first run (§5.1) |
| C17 | No dependency outside core, the SDK and Node builtins | `packages/cli/src/package.test.ts` — manifest **and** import graph, with a control |
| C18 | The Connect page names `41p pull`; README pinning still passes | `connect.spec.ts`, `steps.test.ts`, and the drive's screenshot |
| C19 | `pnpm test`, `typecheck`, `lint` green; `gates.mjs ci` green on the commit | §7 |
| C20 | The drive | §6 — 22/22 |

**All twenty ticked.**

---

## 3. The nine rulings, one line each

1. **The generator moved into `packages/core`** rather than being copied. Rule 11 stopped the CLI
   importing `apps/*`, and two copies of one file format is the defect this repository has refused
   three times.
2. **`41p.lock.json` records what was pulled, not what is Live.** The other way round is a cache of
   a moving number, and `check` would always pass.
3. **Python is generated and the command says what the runtime does today.** EPIC-055 ruling 3
   pointed the other way: there the file worked and the tool did not exist; here the file is right
   and the runtime underneath it is not.
4. **`41p run` does not call a model.** §8 has the full argument and states the narrowing plainly.
5. **The CLI fetches `/v1` itself; verification goes through core.** ADR-006 froze the SDK surface
   and this does not widen it.
6. **`packages/cli/src` joined the forbidden-word roots.** Lesson 19, third time.
7. **Three exit codes, and `1` must never look like `2`.**
8. **`link` never writes the key and refuses to prompt with no terminal.**
9. **The header is the roadmap's ownership sentence**, which changes the header EPIC-055 shipped.

---

## 4. Two decisions worth reading the reasoning for

### 4.1 The move was proved, not assumed

EPIC-055 committed to the Connect page's `prompts.ts` being *"precisely the file"* `41p pull` writes.
Moving a generator and trusting that is how a refactor quietly changes a customer's file.

So: eight input sets — empty, one prompt, required and optional variables, an undeclared variable, a
leading digit, non-ASCII, quoted keys, a collision — through the old function and the new one, with
the comment lines stripped. **Bodies byte-identical in all eight. Headers changed in all eight**,
which is ruling 9 and the only intended difference. A control confirmed the probe could tell two
different outputs apart.

`apps/web/lib/connect/generate.test.ts` keeps the standing version of that: the page's output and
core's, asserted equal, with a control.

### 4.2 Python diverges from TypeScript, and it was measured rather than chosen

TypeScript quotes an object key, so `{{customer name}}` survives into the signature. **Python
cannot** — a keyword argument must be an identifier.

`TypedDict`'s functional form can express the awkward names, and it does not survive `mypy --strict`
at the call site: a heterogeneous `TypedDict` reads as `Mapping[str, object]`, so
`resolve(id, dict(v))` fails against a `dict[str, str]` parameter. That was run before the design was
chosen, not argued about.

So the Python binding takes keyword arguments and **puts the real variable name back in the dict
literal one line later**, where it is visible:

```python
def odd_names(*, customer_name: str, x_locale: Optional[str] = None, class_: str) -> ResolveResult:
    v: dict[str, str] = {"customer name": customer_name, "class": class_}
```

EPIC-054's Review line asks for a divergence table. This is its first row.

---

## 5. What the gates found that a reviewer would not have

### 5.1 `packages/cli/src` joined the forbidden-word roots and fired immediately

Three strings, on the first run — the same shape as EPIC-052's eleven when `packages/sdk-ts/src`
joined. Renamed to `build`, which is `lib/deploy/store.ts`'s own argument for calling its keys
`builds/`. Lesson 19 for the third time, and it has now paid three times.

### 5.2 The CLI's typecheck was green over a package that did not compile

`tsconfig.base.json` sets `types: []`. `process` and `node:fs` resolved **only because the test files
pull in `vitest`, whose types reference Node's** — and `tsconfig.build.json` excludes tests, so the
build program had neither. `pnpm typecheck` passed; `pnpm build` failed.

A gate passing for the wrong reason, in the one place nobody looks: the difference between two
tsconfigs. `types: ["node"]` is now declared with the reason in the file.

### 5.3 Two tests read `scripts/`, and only the mirror could see it

`packed.test.ts` shells out to `scripts/pack-41p.mjs`. `pnpm mirror-dry-run` filters the repository
to the four public packages, and `scripts/` is excluded on purpose — so it was green everywhere and
died on `Cannot find module` in the one job that filters.

**That is `docs/PROCESS.md`'s "Local green is not CI green" failure #1, verbatim**, written down as
the first of five mechanisms, and it still took reproducing to notice. Both repo-level tests moved to
`apps/web`, which the mirror does not contain, each with a header saying why a test about `41p` lives
there. A skip was the alternative and was rejected: a skip reads as a pass.

### 5.4 A test shelling out to `pnpm build` mid-run took out two other packages

`packed.test.ts` built three packages while turbo was already running the test task, rewriting `dist`
underneath the packages testing beside it. It failed `@41prompts/sdk`'s tarball test in one run and
`@41prompts/web`'s suite in another — **two different-looking failures, one cause, and both looked
like flakiness.** `--no-build` plus `turbo.json` ordering; `pnpm test` then went green three
consecutive runs having failed two of the previous three.

### 5.5 A hand-built `env` did not satisfy `apps/web`'s augmented `ProcessEnv`

`{ PATH, HOME }` is missing `NODE_ENV`. Because `next build` typechecks, this failed **both**
`pnpm typecheck` and `pnpm e2e` in the CI-parity run — two red steps, one cause. Subtractive now.

---

## 6. The defect the gate found that was not mine, and is the most important thing here

### Project ids collide, and nothing drew again

`gates.mjs ci` failed its e2e step three runs running, **on a different test each time**, each
looking like a timeout or an unrelated assertion. Reading the server log rather than the test output
found the real sentence:

```
duplicate key value violates unique constraint "projects_pkey"
```

`CLAUDE.md` fixes a project id at `proj_` + **4 hex** — 65,536 values. That is a deliberate trade for
an id people read aloud and type into URLs, and it is not collision-free.
`packages/db/src/ids.test.ts` has said so since it was written:

> *"project ids rely on the column's primary key plus a **retry-on-conflict at insert time** (not
> built by this epic, since nothing creates a project yet beyond the seed script), not on the
> generator alone."*

**Nothing created a project then. Everything creates projects now** — every e2e test, every drive,
every sign-up — so the deferred retry came due and nobody noticed, because it presents as flakiness.

`packages/db/src/create-project.ts`: `insertProject`, four attempts, only `23505` retried. Both
`apps/web` creation sites call it — putting the retry in one would have left the other broken in a
way nobody finds until it happens in front of somebody.

**`mintId` is an injectable parameter with the real generator as its default, and that is what makes
the retry provable.** Without it, a suite that inserts projects passes identically against the
version with no retry at all — which is exactly how this survived. The two tests that matter hand
back an already-taken id and assert the generator is called three times, and assert exactly
`PROJECT_ID_ATTEMPTS` draws before `ProjectIdExhausted`.

**Widening the id is yours, not mine.** The primary key already makes a collision impossible to
*store*; the only thing missing was drawing again. If you want a wider id, that is a `CLAUDE.md`
change and a migration.

---

## 7. The drive

`npx tsx scripts/drive-epic-053.mts`, against the **built** app on `localhost:3116`, and the
**packed** binary — not `tsx src/bin.ts`. **22 of 22.**

`scripts/pack-41p.mjs` assembles the tree npm would install. The built `dist/bin.js` cannot run
inside this repository — core's `main` is `src/index.ts` here by design — so the alternative was
running the source, which is `PROCESS.md`'s twenty-epic `next dev` failure in a new costume.

The journey, in order: sign up, create a project and a prompt by clicking, publish, mint a key on the
keys page, then leave the browser — `link`, `pull`, `tsc --strict` over the file that lands, `check`
(0), publish a second version in the browser, `check` (1, naming the prompt and both versions),
`check` with no key (2, **not** 1), `pull`, `run`, `run` with a variable missing, `decompile` with no
configuration at all, `pull --lang python`, and back to the Connect page for its new clause.

`docs/epics/reports/screenshots/EPIC-053/` has the Connect page at 1440 and 390, the real terminal
transcript, and both generated files.

**Both defects the first run found were in the drive, not the product**, and both are lessons that
already exist:

- **Lesson 21.** The helper used `execFileSync`, which discards stderr unless the command fails — so
  the drive reported that `41p run` does not print its note to stderr, a claim about *which stream*
  made by a harness that could not see one of them.
- **Lesson 23.** `publish()` waited for the Live card to be *visible*, and after the first publish it
  already was — so the second publish returned the old text and the drive printed *"Live v2 — Deploy
  says Live v1"* while `41p check` correctly said v2. The assertion passed and the label was wrong.

---

## 8. `41p run` does not call a model, and that is a narrowing

`docs/roadmap.md` lists `run` without saying what it runs. **This does not execute a prompt against a
provider.**

- `/v1` has four routes — `prompts`, `marker`, `build`, `blob` — and none of them runs anything.
  `/api/prompts/*` is session-authenticated and belongs to the browser.
- A public, key-authenticated run endpoint spends somebody's money through a credential designed for
  reads, and needs rate limiting, quota and abuse handling behind it. That is an epic.
- Calling a provider from `packages/cli` puts model traffic in a public zero-dependency package and
  duplicates `apps/worker`'s adapters, which `CLAUDE.md` keeps proprietary and in the worker.

What it does instead is the question nothing else answers: *"what exactly is my program sending?"* —
the compiled prompt, at the version that is Live now, with these variables bound, including the
defaults that filled themselves in.

It returns **raw bytes** rather than lines, because the compiled prompt ends with the separator the
compiler emits, and a command whose whole claim is *this is what your program sends* may not add a
byte or trim one. `41p run x > prompt.txt` writes the prompt and nothing else; the commentary is on
stderr.

**If you want `run` to mean "call a model", say so and it is its own epic.**

---

## 9. Gates

`node scripts/gates.mjs ci` on `e138196`: **16 steps, all passed, 9m46s**, clean checkout, frozen
lockfile, cold cache.

```
  checkout        git clone + checkout           PASS
  ci.yml          pnpm install --frozen-lockfile PASS
                  pnpm lint                      PASS
                  pnpm typecheck                 PASS
                  pnpm db:migrate                PASS
                  pnpm test                      PASS
                  playwright install chromium    PASS
                  pnpm e2e                       PASS   4 skipped on darwin
                  uv run pytest -q               PASS
  compliance.yml  reuse lint                     PASS
                  pnpm boundaries                PASS
                  turbo boundaries               PASS
                  pnpm forbidden-words           PASS
                  pnpm binary-files              PASS
                  license-gate --sbom            PASS
                  pnpm mirror-dry-run            PASS
```

**What that green does not cover**, printed by the run and repeated here because it is part of the
result:

1. **The runner is Linux and this is darwin.** The four visual-regression baselines are `-linux.png`
   and skip here. A layout change can pass this and fail CI.
2. **The runner is slower.** A test that only fails under load passes here.
3. **And, since nothing is pushed:** no second machine builds this, no image is built, nothing
   deploys, and Coolify, Traefik and migrations against the real database are all untested. Those
   wait for your next push.

---

## 10. Not built, and why

1. **Publishing to npm or PyPI.** EPIC-056 owns the split and trusted publishing; EPIC-006 (the
   accounts) is `deferred` and yours. Every `prepublishOnly` refuses until
   `github.com/41prompts/41prompts` exists. **Nothing was published and nothing can be.**
2. **The Python runtime.** EPIC-054. This epic generates the file that will call it and says so when
   it writes it.
3. **`41p run` against a model.** §8.
4. **A wider project id.** §6 — yours.

---

## 11. Open questions, all yours

1. **Should `41p run` call a model?** §8 says why it does not and what building it would cost. If the
   answer is yes, it needs a `/v1` run endpoint with quota and rate limiting, and that is an epic.
2. **`proj_` + 4 hex.** §6. The retry makes it safe; the id is still short enough that a busy account
   will make the retry fire routinely. Widening it is a `CLAUDE.md` change and a migration.
3. **`41p.lock.json` as the name.** It sits beside `.41prc`. If you would rather the two matched —
   both dotfiles, or both suffixed — now is the cheap moment.
4. **The Connect page's Python tab.** Out of scope here (EPIC-055's Goal line is TypeScript only),
   but `41p pull --lang python` now exists and the page could name it. EPIC-054's call.

---

## 12. Dependencies

**No new runtime dependency.** `@41prompts/cli` declares `@41prompts/core` and `@41prompts/sdk`, both
workspace packages, asserted by `package.test.ts` over the manifest *and* the import graph.

**One new dev-only tool: `mypy`**, used through `uv run --with mypy` and never installed into
`sdks/python`. C5 cannot be checked without it.

---

## 13. Verify it

```
docker run -d --rm --name 41p-e2e-postgres -p 55435:5432 \
  -e POSTGRES_USER=41p -e POSTGRES_PASSWORD=41p -e POSTGRES_DB=41p postgres:16
export DATABASE_URL=postgres://41p:41p@127.0.0.1:55435/41p && pnpm db:migrate

pnpm --filter @41prompts/cli test        # 89 tests
pnpm --filter @41prompts/core test       # includes the codegen suites
pnpm --filter @41prompts/db test         # includes the project-id retry
pnpm --filter @41prompts/web test        # includes both repo-level CLI tests
pnpm e2e --grep "connect"
node scripts/gate-run.mjs

# the binary, as npm would install it
node scripts/pack-41p.mjs --out /tmp/packed
node /tmp/packed/node_modules/@41prompts/cli/dist/bin.js --help

# the drive, against the built app — see the script's header for the full sequence
npx tsx scripts/drive-epic-053.mts
```
