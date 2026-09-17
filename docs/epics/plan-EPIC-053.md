<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-053: `41p`

Written before any code, per `CLAUDE.md`'s "Plan first" and `docs/AUTONOMOUS.md` step 2. The epic
file is `docs/epics/EPIC-053-cli.md`; this is the order of work and the traps.

## The shape

```
packages/core/src/codegen/          pure, zero-dependency, golden-tested
  types.ts                          CodegenPrompt — the rows both languages read
  header.ts                         the ownership sentence, one copy
  identifiers.ts                    name -> identifier, collisions (moved, unchanged)
  typescript.ts                     moved from apps/web/lib/connect/generate.ts
  python.ts                         new, same rows, snake_case and TypedDict

packages/cli/src/
  bin.ts                            argv -> command, exit code, never a stack trace
  exit.ts                           the three codes, one table
  out.ts                            stdout/stderr seam so a test reads output
  config.ts                         .41prc read/write, key resolution order
  lockfile.ts                       41p.lock.json read/write/compare
  api.ts                            thin /v1 client; verification delegated to core
  commands/{link,pull,check,run,decompile}.ts
  __goldens__/                      prompts.ts.txt, prompts.py.txt

packages/cli-unscoped/              the thin `41p` wrapper
```

## Order, and why this order

1. **`codegen/` in core, with the move first.** Everything else reads it and the move is the
   riskiest single step — it must not change a byte of EPIC-055's output except the header. Do it
   with the existing test moved alongside, run it, then change the header deliberately in its own
   commit so the diff shows exactly one intended difference.
2. **`python.ts`**, against a golden written by hand from the TypeScript one, so the two are read
   side by side rather than one generated from the other.
3. **The CLI's plumbing** — `exit.ts`, `out.ts`, `config.ts`, `lockfile.ts`, `api.ts` — before any
   command, because every command is a thin arrangement of them and the exit-code table has to exist
   before the first command can obey it.
4. **`decompile`** next, not last: it is the only command with no network and no config, so it
   proves the binary, the arg parsing and the exit codes on their own.
5. **`link`**, **`pull`**, **`check`**, **`run`**.
6. **The unscoped package**, the forbidden-words root, the Connect page clause.
7. Gates, drive, merge, report.

## The traps, named before they happen

- **The move must be byte-identical.** `apps/web/lib/connect/generate.test.ts` has the existing
  assertions; they move to core and must pass unchanged *before* the header ruling is applied.
  Assert the equality directly (C1) rather than trusting that two callers of one function agree —
  the point is to prove the seam, and a test that only calls core proves nothing about the page.
- **`out.ts` exists so tests do not capture global stdout.** A command that calls `console.log`
  directly is a command whose output a test can only assert by monkey-patching, and a monkey-patch
  that leaks makes the *next* test fail for reasons of its own. Lesson 10's shape.
- **`api.ts` takes a `fetch` rather than calling the global.** Same reason the SDK's `FetchLike`
  exists, and it is what lets C11 assert that `decompile` makes no request with a stub that fails
  the test if called — a positive control, not an absence assumed.
- **Node builtins only.** `node:fs`, `node:path`, `node:readline`, `node:process`, global `fetch`
  (Node 22). No `commander`, no `chalk`, no `prompts`. C17 asserts it over the manifest *and* the
  import graph, because a manifest with no dependencies still passes if the code imports something
  transitively.
- **The bin entry must work from `dist` when published and from `src` in the monorepo.** `packages/core`
  already solves this with `publishConfig`; copy that arrangement rather than inventing one. The
  current `bin` points at `src/bin.ts` with a `tsx` shebang and `files: ["dist"]`, which would
  publish a package whose entry point is absent — fix it here.
- **`mypy --strict` may not be runnable.** `sdks/python` has `uv.lock` and a pytest setup; whether
  `mypy` is available is unknown until tried. C5 says: if it cannot run, report it unticked with the
  reason. Do not reword the criterion and do not claim it from a reading.
- **The golden files are the test, so they are written by reading the output once and then never
  regenerated casually.** A golden updated to match a change is a golden that has stopped asserting.
- **`pnpm boundaries` and dependency-cruiser** will have an opinion about `packages/cli` importing
  `@41prompts/sdk`. Both are public, so it is allowed — but the allow-list may name packages
  explicitly and need the edge added. Check before assuming.

## What the drive has to show

Not a page — a terminal, plus one page. Against the **built** app:

1. Fresh throwaway user, project, prompt, bloks, all by clicking. Publish it.
2. Mint a key on the keys page (EPIC-055's tab — this is now the supported route).
3. `41p link`, `41p pull`, and open the file that lands.
4. `tsc --strict` over the generated file in a scratch directory — the roadmap's Review line, done
   for real rather than asserted in a unit test.
5. `41p check` → `0`. Publish a second version in the browser. `41p check` → `1`, naming the prompt.
6. `41p run` with a variable, and with one missing.
7. `41p decompile` on the Northwind sample.
8. The Connect page showing the new clause.

Screenshots and terminal transcripts into `docs/epics/reports/screenshots/EPIC-053/`.
