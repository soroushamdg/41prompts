<!--
SPDX-FileCopyrightText: 2026 <legal entity>
SPDX-License-Identifier: Apache-2.0
-->

# @41prompts/cli

`41p` — your prompts, in your repository. Zero dependencies outside `@41prompts/core` and
`@41prompts/sdk`. Apache-2.0.

```
41p link                       write .41prc and prove your key works
41p pull [--lang python]       write prompts.ts, the lockfile and the bundled builds
41p check                      is what you generated still what is Live?  (for CI)
41p run <promptId> --var k=v   print the prompt your program would send
41p decompile <file>           read a prompt file and say what is wrong with it
```

## Getting started

```
export FORTYONE_API_KEY=41p_live_…      # Settings → API keys, shown once
npx 41p link
npx 41p pull
```

`pull` writes three things:

| file | what it answers |
|---|---|
| `prompts.ts` | how your code calls a prompt. One typed function each. |
| `41p.lock.json` | what was Live when you pulled, so `41p check` can tell you when that stops being true. |
| `41p/builds/*.json` | the builds themselves, for `createClient({ bundled })` — the answer when there is no cache and no network. |

Commit all three.

## Your key is never written to a file

`.41prc` holds the base URL and where generated files go. **The key stays in `FORTYONE_API_KEY`**,
which is where `@41prompts/sdk` already reads it from.

A credential in a file that looks like configuration is a credential that reaches a commit — it sits
beside `package.json`, it has no extension anyone associates with secrets, and the first thing most
people do after linking is `git add .`.

## `41p check` in CI

```yaml
- run: npx 41p check
  env:
    FORTYONE_API_KEY: ${{ secrets.FORTYONE_API_KEY }}
```

Three exit codes, and the difference between the last two is the point:

| code | means | what to do |
|---|---|---|
| `0` | current | nothing |
| `1` | **stale** — somebody published and this repository has not pulled | `41p pull`, commit |
| `2` | **cannot answer** — no `.41prc`, no key, a refused key, no network | fix the pipeline |

A build that failed identically for "your prompt moved" and "this job has no credential" would teach
people to ignore both. `1` is a real answer with a ten-second fix. `2` is a broken pipeline.

`check` also notices when somebody has hand-edited the generated file, and says so separately — the
next `pull` would overwrite it, and that is worth knowing before it happens.

## The generated file is yours

Every generated file opens with

```
// This file is yours; 41Prompts claims no rights in it.
```

and that is meant literally. It is a wrapper around `resolve()`; if you would rather write your own,
delete it.

## `41p run` does not call a model

It resolves the Live prompt, binds your variables and prints **exactly what your program would
send** — including the values that filled themselves in from a declared default. Nothing is sent
anywhere and nothing is charged.

```
41p run pr_1a2b3c4d --var email=hello@example.com > prompt.txt
```

The prompt goes to stdout with nothing added, so redirecting it gives you the bytes. The commentary
goes to stderr.

Running a prompt against a model is the product's own Runs page. There is no key-authenticated run
endpoint, and this command does not pretend otherwise.

## `41p decompile` needs no account

It reads a file, runs the segmenter, the clustering and the detectors locally, and prints what it
found. **Nothing leaves your machine** — no key, no request, no upload. Exits `1` when there are
findings, so CI can key on it.

## Python

`41p pull --lang python` writes `prompts.py`. The generated code passes `mypy --strict`.

The Python *runtime* is not finished: `fortyone.resolve()` currently returns
`{"text": "", "status": "unavailable"}`. The command says so when it writes the file.

Where TypeScript takes an object, Python takes keyword arguments — a prompt variable called
`customer name` cannot be a Python parameter, so the parameter is `customer_name` and the real name
goes back in the mapping one line later, where you can see it.

## Not published yet

`github.com/41prompts/41prompts` does not exist yet, and every `prepublishOnly` in this repository
refuses until it does.
