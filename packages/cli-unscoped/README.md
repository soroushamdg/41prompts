<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# 41p

The 41Prompts CLI. **This package is four lines**; everything is in
[`@41prompts/cli`](https://www.npmjs.com/package/@41prompts/cli), which it depends on and re-runs.

## Three steps

```bash
npm install -g 41p          # or skip it entirely and use npx
```

```bash
export FORTYONE_API_KEY=41p_live_…   # Settings → API keys, shown once
41p link && 41p pull
```

```bash
41p check                   # in CI: is what you generated still what is Live?
```

No key and no account needed for the one that reads a file and tells you what is wrong with it:

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

Neither package is on npm. `github.com/41prompts/41prompts` exists as of 2026-09-18 and the
publishing workflow is written, but **the unscoped name `41p` has not been registered**, so this
package specifically cannot go out until it is. `prepublishOnly` here refuses outside the public
repository regardless.

Apache-2.0.
