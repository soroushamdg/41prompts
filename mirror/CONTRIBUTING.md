<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Contributing

Thank you for looking. This is a small project and a pull request is read by the people who wrote
the code.

## Sign your commits off

```bash
git commit -s
```

Every commit needs a `Signed-off-by:` trailer certifying you have the right to submit the change
under the [Developer Certificate of Origin](DCO). **The project uses the DCO, not a CLA** — nothing
to sign, no paperwork, and you keep your copyright. A pull request with an unsigned commit will be
asked to amend and re-sign before it can merge.

## What is here, and what is not

Everything in this repository is Apache-2.0. The hosted workbench at `app.41prompts.ai` — the web
application, the job runner, the database schema, the design system and the judge prompts — is
proprietary and lives in a private repository. This one is generated from it with a
history-preserving filter, so the commit history you see is real.

**One consequence worth knowing before you open a large pull request:** changes here are merged
upstream in the private repository and flow back out. That is invisible for an ordinary change and
it matters for a big one, so open an issue first for anything substantial and we will tell you
whether it fits.

## The rule that is enforced rather than remembered

**A public package may import only other public packages, Node builtins, or its own declared
dependencies.** `@41prompts/core` additionally has **zero dependencies, no DOM and no IO** — it is
pure TypeScript, and that is what lets it run inside an SDK that ships to somebody else's process.

This is checked by `dependency-cruiser` and by each package's `turbo.json` `tags: ["public"]`, not
by review. A violation fails the build with the rule's name in the message.

## Three things that are design, not preference

These come up in review often enough to be worth stating up front:

1. **Segmentation and clustering are deterministic.** No model call chooses a boundary. Models label
   and summarise, and that happens on the server, not in this code.
2. **A blok stores the verbatim source span.** Summaries are metadata. The compiler never emits a
   paraphrase of what somebody wrote.
3. **The word is "blok", not "block"**, everywhere — code, schema and text. It is deliberate and it
   is checked.

## Running the checks

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm lint
pnpm compliance     # REUSE headers and the boundary rules
```

Node 22 and pnpm 10. The Python SDK is [uv](https://docs.astral.sh/uv/):

```bash
cd sdks/python && uv run pytest && uv run mypy --strict fortyone tests
```

**New files need a licence header.** Every source file carries
<!-- REUSE-IgnoreStart -->`SPDX-FileCopyrightText: 2026 41Prompts Inc.` and
`SPDX-License-Identifier: Apache-2.0`<!-- REUSE-IgnoreEnd -->. `pnpm reuse-lint` will tell you if
you missed one; for a file that cannot carry a comment, add a `.license` sidecar beside it.

## Reporting a vulnerability

Not here. [`SECURITY.md`](SECURITY.md) — email, do not open an issue.
