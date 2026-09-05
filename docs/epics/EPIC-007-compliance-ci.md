# EPIC-007: Compliance CI
Stage: 0 · Depends on: EPIC-000 · Size: S

## Goal
The licence and boundary promises in ADR-002 are enforced by CI, not by memory. A pull request that would leak
proprietary code into a public package, add an incompatible dependency, or drop a licence header fails before it
merges. The public mirror can be produced on demand and is proven to build.

## Decisions (do not re-litigate)
1. **Public packages**: `packages/core`, `packages/cli`, `packages/sdk-ts`, `sdks/python`. Everything else is
   `LicenseRef-41Prompts-Proprietary`. Apache-2.0 + NOTICE + SPDX headers on the public four (ADR-002).
2. **Allow-list, not deny-list** (ADR-001 revision): a public package may import only other public packages, Node
   builtins, and its own declared dependencies. `packages/core` imports nothing. `packages/sdk-ts` has zero npm
   dependencies. Enforced by dependency-cruiser rules with the rule names in the failure message.
3. **REUSE** for licence-header linting over the whole repo, with a small `.reuse/dep5`-equivalent for files that
   genuinely cannot carry a header.
4. **SBOM** generated per release (CycloneDX) and attached to the GitHub release; a licence gate fails the build
   on any dependency licence outside the allow-list (permissive only: MIT, Apache-2.0, BSD-2/3, ISC, 0BSD,
   Unlicense, Python-2.0). Copyleft in a public package is a build failure; in a private package it is a review
   comment, not a block.
5. **Mirror dry-run**: a job that produces the public-only tree with history for the four public packages and
   proves it installs and tests standalone, without publishing anything. The real split is EPIC-056.
6. **Forbidden-word grep** over UI strings and code identifiers for the ADR-003 list, wired as a CI job rather
   than a convention: block, assertion, label, pointer, artifact, promote, enum, sha, reconcile, drifted.
7. Every check runs on pull requests and on `main`. A check that only runs nightly is a check nobody trusts.

## Scope
- `.github/workflows/compliance.yml`: REUSE lint, dependency-cruiser allow-list, Turborepo boundary tags, SBOM
  generation + licence gate, forbidden-word grep, mirror dry-run.
- Fix whatever the new checks find in the existing tree; that is the point of turning them on.
- `docs/decisions/ADR-002` referenced from the workflow so a failure tells the reader where the rule comes from.
- A short `CONTRIBUTING.md` section: DCO sign-off, which packages are public, how to run every compliance check
  locally with one command.
- `pnpm compliance` runs the whole set locally.

## Out of scope
- Publishing anything to npm or PyPI. (EPIC-056.)
- The actual public repository. (EPIC-056.)
- Trademark, entity name, IP assignment. (EPIC-006, EPIC-071.)
- Security scanning of dependencies for vulnerabilities; that is EPIC-901's monthly audit.

## Acceptance criteria
- [ ] Every compliance check runs on pull requests and on `main`, and the whole set runs locally with
      `pnpm compliance`. Evidence: workflow run and local output.
- [ ] A deliberate import of `packages/db` from `packages/core` fails CI with the dependency-cruiser rule name in
      the message. Evidence: the failing run, then the revert.
- [ ] A deliberate npm dependency added to `packages/sdk-ts` fails CI. Evidence: same.
- [ ] A public source file with its SPDX header removed fails REUSE lint. Evidence: same.
- [ ] A dependency with a copyleft licence added to a public package fails the licence gate. Evidence: same.
- [ ] The forbidden-word grep fails on a deliberately introduced "block" in a UI string. Evidence: same.
- [ ] The mirror dry-run produces a tree containing only the four public packages, and `pnpm install && pnpm test`
      passes inside it. Evidence: job output and the file list.
- [ ] SBOM is generated and attached on a `v*` tag. Evidence: release asset.
- [ ] The existing tree passes everything with no exclusions added to make it pass. Evidence: green run and the
      diff of anything that had to be fixed.
- [ ] Report and session log written; backlog updated.

## Verification
```
pnpm compliance
```

## Notes for the implementer
- Each of the five "deliberate failure" criteria is one commit that breaks it, one CI run as evidence, one revert.
  Do them on a scratch branch; do not merge any of them.
- If an existing file cannot pass a check without weakening it, fix the file, not the check; if that is impossible,
  write `docs/epics/BLOCKER-EPIC-007.md` and stop.
- Keep the workflow fast; if the whole set exceeds three minutes, split the slow job rather than dropping a check.
