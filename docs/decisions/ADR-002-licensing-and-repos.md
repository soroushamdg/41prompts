# ADR-002: Licensing, repositories, names

Status: accepted · 2026-08-19 · revised 2026-09-04 after the licensing review

## Decision

- **Public, Apache-2.0:** `packages/core`, `packages/cli`, `packages/sdk-ts` (published as `@41prompts/sdk`), `sdks/python` (`fortyone-prompts`, import `fortyone`). Each carries `LICENSE` (Apache-2.0 verbatim) and `NOTICE`; every source file carries SPDX headers.
- **Proprietary:** `apps/web`, `apps/worker`, `packages/db`, `packages/ui`, `infra/`, `docs/`. Marked `"private": true, "license": "UNLICENSED"` and `LicenseRef-41Prompts-Proprietary` in `REUSE.toml`.
- **What stays out of `core`:** judge prompts, summariser prompts, drift heuristics, anything we are not content to see forked. They live in `apps/worker`, or in a proprietary `packages/engine` (pure TS, tested, private) if a package boundary is needed.
- **One private monorepo** until EPIC-056; then a public repository `41prompts/41prompts` produced by a history-preserving filter of the four public paths plus `.public-root/`. The private monorepo remains the source of truth. Publishing to npm and PyPI happens only from the public repo via trusted publishing; `prepublishOnly` guards refuse to publish from anywhere else.
- **Contributor IP: DCO**, not CLA. `git commit -s`, DCO app required on the public repo, patches applied with `git am` so authorship survives.
- **Names reserved in EPIC-006:** npm org `@41prompts` (2FA, trusted publishing, no tokens); GitHub org `41prompts`; PyPI `fortyone-prompts`, plus `fortyone` and `41prompts` if free. If `fortyone` on PyPI is taken, the Python import becomes `fortyone_prompts` before any code depends on it. Thin unscoped npm packages `41p` and `41prompts` published at EPIC-056.
- **Trademark:** knockout search in EPIC-006; word mark "41PROMPTS" filed at CIPO and USPTO, classes 9 and 42, with Paris priority, no later than the loud launch (EPIC-035). Logo filed when final. `TRADEMARKS.md` in the public repo.
- **Copyright holder:** `<legal entity>` placeholder until incorporation. Founder-to-company IP assignment executed before EPIC-056.

## Proprietary licence text

`LICENSES/LicenseRef-41Prompts-Proprietary.txt`, verbatim:

```
Copyright 2026 <legal entity>. All rights reserved.

This software is proprietary and confidential. No licence is granted to use, copy,
modify, distribute, or create derivative works of it except under a written agreement
with <legal entity>.
```

**Amended 2026-09-13.** The word **"confidential" was removed** from
`LICENSES/LicenseRef-41Prompts-Proprietary.txt`; the quote above is left as it stood so the record
shows what was corrected. The repository was public for a period in September 2026 as a cost
decision about GitHub Actions minutes, which made "confidential" a false statement about how the
material had been handled, and taking the repository private again does not un-publish it. Only the
false word was deleted — no new legal language, no change of intent. "All rights reserved" carries
the same protection without depending on secrecy, which is the point: the licence never rested on
the material being unseen.

SPDX headers in public source files follow a shebang line where one exists; the header is then lines 2–3.

## Why

- Developers will only run our SDK inside their app if they can read it and their scanners accept it. Apache-2.0 passes every default allow-list; source-available licences do not.
- Apache-2.0 over MIT: an express patent grant with retaliation (the only licence-level lever against a fork that then litigates), a trademark clause that withholds the name from forks, and a NOTICE that travels with every copy.
- The open decompiler is distribution; `41p decompile <file>` needs no account.
- Two repositories during the months before any external user exists is friction with no benefit; the mirror dry-run in CI (EPIC-007) proves the split works long before it happens.

## Consequences

- No proprietary import may cross into a public package (CLAUDE.md rule 11; dependency-cruiser allow-list; Turborepo boundary tags). CI fails on violation.
- The artifact schema in `packages/core` is a public contract from EPIC-050 onward and is versioned.
- Code contributed by others under DCO can never be moved to a source-available licence without a rewrite. Accepted.
- Generated files from `41p pull` belong to the customer; the header says so.
