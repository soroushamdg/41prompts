<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# 41p

The 41Prompts CLI. **This package is four lines**; everything is in
[`@41prompts/cli`](https://www.npmjs.com/package/@41prompts/cli), which it depends on and re-runs.

```
npx 41p decompile my-prompt.txt
```

## Why two packages

`@41prompts/cli` is the scoped name, which is where the code belongs: it is versioned with the rest
of `@41prompts/*` and it is what `41p.lock.json` and the documentation refer to.

`41p` is what a person types. An unscoped name is shorter, it is what `npx` reads most naturally, and
it is the one somebody will guess. Owning it also means nobody else can take it and ship something
that looks like us.

Keeping it thin is the point: a wrapper with no code of its own cannot drift from the thing it wraps,
and a bug is never fixed in one of the two.

## Not published yet

Neither package is on npm. `github.com/41prompts/41prompts` does not exist yet — EPIC-056 creates it,
along with trusted publishing — and every `prepublishOnly` here refuses until it does.

Apache-2.0.
