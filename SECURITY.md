<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Security policy

## Reporting a vulnerability

Email **security@41prompts.ai**. Please do not open a public issue for a vulnerability, and please
do not disclose it publicly until we have had a chance to respond.

Include what you need to include for us to reproduce it: the version or commit, the steps, and what
you observed. If you have a proof of concept, send it — we would rather read it than guess at it.

**What to expect.** An acknowledgement within three working days, an assessment with a severity and
a plan within ten, and credit in the release notes if you want it. If we disagree with your severity
we will say so and say why, rather than quietly filing it lower.

**This is a small project.** There is no bounty programme and no dedicated security team. What there
is: the reports are read by the people who wrote the code, and the threat models below are the ones
we hold ourselves to.

## What is in scope

| | |
|---|---|
| `@41prompts/core` | the segmenter, compiler, checks, graders and the build format |
| `@41prompts/sdk` | the TypeScript runtime resolver |
| `@41prompts/cli` and `41p` | the command-line tool |
| `fortyone-prompts` and `41prompts` (PyPI) | the Python runtime resolver |
| the published build format itself | `docs/decisions/ADR-005-build-artifact.md` in the private repository |

The hosted service at `app.41prompts.ai` is in scope too; report it to the same address.

## Supported versions

Only the most recent minor release of each published distribution receives security fixes. The
project has not yet reached 1.0 and there is no long-term-support branch; if you are pinned to an
older version, the fix will be an upgrade.

## Two things we already know, and want you to know before you look

Honesty is cheaper than a report that tells us something our own documents say:

1. **A content address is not a signature.** Both SDKs re-derive the build's content address on
   read, which proves the document is intact — not that it is ours. Anyone who can write into the
   SDK's cache directory can write any prompt text, compute the matching address, and choose the
   identifier too. Signing is a known, open piece of work. The Python SDK refuses a cache directory
   other users can write to; the TypeScript one does not yet.
2. **The SHA-256 used to address every build is hand-written**, because `@41prompts/core` may have
   no dependencies and no access to `node:crypto`. It is proved against the published FIPS 180-4
   vectors. It has not been reviewed by a cryptographer, and we would like it to be.

Neither of these is a reason not to report something. They are the two places we would look first.
