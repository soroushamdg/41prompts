<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# ADR-006: `@41prompts/sdk`'s public API is frozen

Status: accepted · 2026-09-17 · EPIC-052

**Written by Claude Code in the advisor's chair**, under `docs/PROCESS.md`'s amendment of
2026-09-15. `docs/roadmap.md`'s EPIC-052 Review line asks for it in as many words — *"Public API
frozen (ADR-006)"* — and that line is the explicit instruction `CLAUDE.md`'s never-touch list
requires for a file in `docs/decisions/`. **Soroush has not read this yet.** Anything here he
disagrees with is cheap to reverse until the package is published, and expensive from the first
`npm install`.

## Context

ADR-005 froze the artifact format and said why: from the moment somebody pins a version of an SDK
and stops upgrading, the thing they pinned cannot be changed, recalled or told about a change.

**The same argument applies to this package's own surface, one layer up.** An artifact is read by
code we wrote; `resolve()` is called by code we will never see. A function removed or a field
renamed is not a deprecation warning in somebody's terminal — it is an application that stops
building, in a repository nobody here has access to, during an upgrade nobody here suggested.

There is one difference from ADR-005 and it cuts the other way. The artifact format is read by
readers in several languages, so its freeze is about bytes. This is a TypeScript surface, so its
freeze is about names and shapes, and semantic versioning is a real mechanism for changing it. The
decision below is therefore not "this can never change" but "**this is what a major version means**,
and here is the list that has to be looked at before one is cut".

## Decision

### 1. The surface is three functions and the types they name

```ts
createClient(options?: ClientOptions): Client
resolve(promptId: string, vars?: Record<string, string>, options?: ResolveOptions): ResolveResult
configure(options?: ClientOptions): void
```

and the types `Client`, `ClientOptions`, `ResolveOptions`, `ResolveResult`, `ResolveSource`,
`Warning`, `WarningCode`, `FetchLike`, `FetchResponse`.

Everything else in the package is internal and may change in a patch release.
`packages/sdk-ts/src/frozen.test.ts` holds the list and fails when a fourth value appears — a list
rather than a snapshot, because a snapshot updates itself the moment somebody runs the suite with
`-u`, which is exactly the moment a freeze needed to say something.

**Why `configure` and a module-level `resolve` exist at all**, given `createClient` can do
everything: `docs/roadmap.md` writes the API as `resolve()`, and a great many applications want
exactly that — one prompt id, one object, no client to thread through five files. The alternative was
making every caller hold a client, and an SDK that forces a structural change on the application
installing it is one people write a wrapper around, which is worse than the singleton.

### 2. `resolve()` is synchronous, and that is the load-bearing decision

`CLAUDE.md` rule 8 says the resolve order is memory → disk → bundled → network **and** that the SDK
never blocks a call on the network. Read as a four-step fallback those contradict each other. They
are reconciled the way the roadmap's own task line writes it — *"memory → disk → bundled →
**background** network"*.

So the network is not the fourth place a call looks. It is what fills the first two.

**What this costs, stated here because it is the one surprise in the API:** the first `resolve()` in
a fresh process with no disk cache and no bundled artifact returns `status: "unavailable"` and an
empty string. `bundled` and `refresh()` are the two answers, and both are in the README's second
section rather than buried in a reference table.

**Why not `async resolve()`.** It would remove the surprise and break the promise: an awaited call
is a call that can hang, and the sentence this product sells is that your app keeps working when we
do not. An async API also makes the failure mode invisible — nobody notices a 400 ms await in a
prompt lookup until the day it is 40 seconds.

### 3. Nothing throws, and the fuzz is part of the contract

Rule 8 again. Every failure is a `ResolveResult` plus a `Warning`.

**This is a promise about untyped callers**, which is the half of the population TypeScript cannot
help. `never-throws.test.ts` calls the whole surface with several hundred generated values — cyclic
objects, proxies whose every trap throws, `Object.create(null)`, frozen objects, symbols, bigints, a
getter that fails — and asserts twice each time: nothing was thrown, **and** the result is a
well-formed `ResolveResult`. The second half matters as much as the first; returning `undefined` also
does not throw, and breaks the caller one line later.

It found three real defects on its first run, all in `createClient`, none of which a typed test could
have reached. That is the argument for keeping it rather than a note about how thorough it is.

### 4. Zero dependencies means the tarball, and core is bundled rather than installed

`package.json` has no `dependencies`, `peerDependencies` or `optionalDependencies`, and
`package.test.ts` reads the **built output** to prove it rather than reading the manifest.

`@41prompts/core` is a devDependency, imported at source and inlined by esbuild. Three constraints
that look like they cannot all hold, and do:

- the roadmap and rule 8 say zero dependencies;
- `artifact/schema.ts` forbids a second implementation of the hash, because *"the failure mode of a
  second copy being that verification quietly always passes"*;
- rule 11 and `.dependency-cruiser.cjs` say the public packages may import each other.

*Importing* and *depending* are different things once there is a build step. The alternative —
declaring core as a runtime dependency — would put 1.6 MB of segmenter, clustering, detectors and
compiler into the `node_modules` of an application that wants a string.

### 5. v1 is Node, and the browser is a v2 question

The disk cache is `node:fs`. `engines` says `>=20`. The Stage 5a exit state is *"the prompt […] lives
in a Node app"*, and a runtime-detected storage layer for a browser nobody has asked for would be the
larger mistake. An edge or browser build is a real question and it is not this one; when it is asked,
the answer is a second entry point, not a runtime check inside this one.

### 6. Both module systems, one bundle each

`dist/index.js` for `import`, `dist/index.cjs` for `require`, `dist/index.d.ts` for both. A large part
of the ICP's Node code is still CommonJS, and an SDK that cannot be `require`d is one a team cannot
adopt without a migration they did not plan.

`dist/index.js` ships **unminified**, deliberately. A customer reading a stack trace out of their own
production logs should see function names. The Review line's 15 KB budget is measured on the minified
bytes, because that is what their bundler emits.

### 7. What a major version means

A major version of this package is exactly one of these:

1. removing or renaming an exported value or type;
2. removing a field from `ResolveResult`, or narrowing one's type;
3. adding a **required** option to `ClientOptions`;
4. changing when `status` is `"ok"`;
5. making `resolve()` asynchronous.

Not a major version: adding an optional option, adding a field to `ResolveResult`, adding a
`WarningCode`, changing a warning's wording, or anything internal. **Adding a `WarningCode` is
explicitly minor** — a caller who switches exhaustively on it will get a type error, and that is the
right trade against never being able to name a new failure.

## Alternatives rejected

**A class, `new PromptClient(...)`.** Rejected because a class is a second thing to freeze — its
prototype, its inheritance, its `instanceof` — for no property a factory function lacks.

**Returning `null` or throwing on a miss.** Both were considered and both push the failure into the
caller's control flow at the moment they are least ready for it. A result object with a `status` is
the only shape where the unhappy path is as visible as the happy one.

**A `strict` option that makes it throw.** Tempting, and it would have made this package two packages
with one name. Rule 8 is not a default; it is the design.

## Consequences

- The five-item list in §7 is what has to be read before a major version, and `frozen.test.ts` is
  what makes ignoring it noisy.
- Adding a fourth exported function means editing this ADR, that test, and the README. That friction
  is the point.
- The bundle budget is measured on every test run and currently has **206 bytes of headroom**
  (15,154 of 15,360). The next feature in this package very likely breaks it, and the correct
  response is to measure what got in — not to widen the number, which is a Review line.

## Open, for Soroush

1. **The 15 KB budget's headroom.** 15,154 bytes minified, 6,188 gzipped. Is the budget about the
   minified bytes (206 bytes spare) or the gzipped ones (9 KB spare)? The strict reading is
   implemented; the looser one is defensible and would want writing down rather than assuming.
2. **`configure()` and a module-level `resolve()`** are a singleton, and singletons in libraries are
   a known cost — two parts of one process cannot be configured differently. Kept because the
   roadmap writes the API as `resolve()`. Worth confirming rather than inheriting.
3. **The default `console.warn`.** Silence was the alternative. A library writing to stderr uninvited
   is rude; a library that is silent while returning empty prompts is worse. One line per distinct
   code is the compromise and it is a judgement call.
4. **`41p-client` as the telemetry header name.** It is a public wire format the moment anyone opts
   in, and it is not in ADR-003's vocabulary either way.
