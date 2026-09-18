<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# 41Prompts

**A prompt is not a string. It is a set of typed pieces, and something should check them.**

This repository holds the open parts of [41Prompts](https://41prompts.ai): the engine that takes a
prompt apart, the format a published prompt travels in, and the two SDKs and the CLI that deliver it
to a running application.

A prompt here is a set of typed **bloks** — context, constraint, example, expected — that each own
one or more **spans** of the compiled text. Expected bloks compile to **checks** rather than to
text, so when a check fails it points at the blok that owns it instead of at the prompt as a whole.

## What is in here

| | what it is | licence |
|---|---|---|
| [`packages/core`](packages/core) | `@41prompts/core` — segmenter, classifier, clustering, detectors, compiler, checks, graders, the build format. Zero dependencies, no DOM, no IO. | Apache-2.0 |
| [`packages/sdk-ts`](packages/sdk-ts) | `@41prompts/sdk` — `resolve()` for TypeScript and JavaScript. Never blocks a call on the network, never throws. | Apache-2.0 |
| [`packages/cli`](packages/cli) | `@41prompts/cli` — `link`, `pull`, `check`, `run`, `decompile`. | Apache-2.0 |
| [`packages/cli-unscoped`](packages/cli-unscoped) | `41p` — the same CLI under a name you can type. | Apache-2.0 |
| [`sdks/python`](sdks/python) | `fortyone-prompts`, imported as `fortyone`. Parity with the TypeScript SDK, zero dependencies, standard library only. | Apache-2.0 |
| [`sdks/python-alias`](sdks/python-alias) | `41prompts` on PyPI — an alias so the brand name reaches the right package. | Apache-2.0 |

**Everything here is Apache-2.0.** The hosted workbench — the web application, the job runner, the
database schema, the design system and the judge prompts — is not in this repository and is not open
source. Nothing you find here is missing a licence; what is here is all of what is open.

## Try it in three steps

```bash
npm install @41prompts/sdk
```

```ts
import { createClient } from "@41prompts/sdk";

const prompts = createClient({ apiKey: process.env.FORTYONE_API_KEY });
```

```ts
const { status, text } = prompts.resolve("pr_1a2b3c4d", { customer_name: "Ada" });
if (status === "ok") {
  await model.complete(text);
}
```

`resolve()` is synchronous and answers from memory, then disk, then what your deploy bundled. **The
network is not the fourth place** — it is a background refresh that fills the first two, which is
what "never waits" means. The cost is stated rather than hidden: the very first call in a fresh
process with no cache and nothing bundled returns `status: "unavailable"`, and
[`packages/sdk-ts/README.md`](packages/sdk-ts/README.md) gives the two ways to be warm before it.

Python is the same shape: `pip install fortyone-prompts`, then `fortyone.resolve(...)`.

## The decompiler, which needs no account

`@41prompts/core` will take a prompt apart on its own, with no key, no network and no service:

```bash
npx 41p decompile ./my-prompt.txt
```

It segments the text deterministically, classifies each piece, and reports what it found — rules
with nothing checking them, contradictions, repetition, padding. **No model chooses a boundary.**
Segmentation and clustering are deterministic by design; models only label and summarise, and that
happens on the server, not here.

## Building it

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
```

Node 22, pnpm 10. The Python SDK uses [uv](https://docs.astral.sh/uv/): `cd sdks/python && uv run pytest`.

## Contributing

[`CONTRIBUTING.md`](CONTRIBUTING.md) has the whole of it. The short version: commits are signed off
under the [Developer Certificate of Origin](DCO) (`git commit -s`), there is no CLA, and a public
package may import only other public packages, Node builtins, or its own declared dependencies.

## Security

[`SECURITY.md`](SECURITY.md). Two known weaknesses are named there before you go looking for them.

## Trademarks

The Apache licence grants rights in the code, not in the names. [`TRADEMARKS.md`](TRADEMARKS.md)
says what that means.
