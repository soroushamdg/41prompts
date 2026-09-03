# ADR-002: Licensing and repository split

Status: accepted · 2026-08-19

## Decision

- `packages/core`, `packages/cli`, `packages/sdk-ts`, `sdks/python`: MIT. Each carries its own `LICENSE` file from day one.
- `apps/web`, `apps/worker`, `packages/db`, `infra/`: proprietary.
- One **private** monorepo until EPIC-056. At EPIC-056, the MIT packages are mirrored to a public repository with release automation. The private monorepo remains the source of truth; the public repo is a published view.

## Why

- Developers will only run our SDK inside their app if they can read it. Open SDK and CLI is the trust mechanism, not a philosophy.
- The compiler and decompiler in the open become distribution: people will use the decompiler from the CLI without an account.
- Two repositories during the months before any external user exists is friction with no benefit.

## Consequences

- No proprietary import may cross into an MIT package. Turborepo boundaries enforce it; CI fails on violation.
- The artifact schema in `packages/core` is a public contract from EPIC-050 onward and is versioned.
- Contributions to the public mirror are accepted as issues and patches, applied in the private repo, and re-mirrored.
