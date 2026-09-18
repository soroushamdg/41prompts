<!--
SPDX-FileCopyrightText: 2026 41Prompts Inc.
SPDX-License-Identifier: Apache-2.0
-->

# Plan — EPIC-072: Marketing site final

Written 2026-09-18, before any code, per `CLAUDE.md` ("Plan first ... stop and show the plan") and
`docs/AUTONOMOUS.md` step 2.

## The shape of it

The epic file argues that the Review line — *every claim maps to a shipped epic* — is the work
rather than a closing check. So the order below builds the **registry first** and the pages out of
it, not the pages first and an audit afterwards. A page written freehand and audited later is a page
whose next copy edit is unaudited.

## Steps, in order

### 1. `apps/web/lib/site/claims.ts` — the registry

```ts
interface Claim {
  readonly id: string;            // stable, kebab-case
  readonly text: string;          // the sentence as it renders
  readonly epic: string;          // "EPIC-053"
  readonly evidence: string;      // a path in this repository
}
```

`CLAIMS` is a frozen record keyed by id. Helpers: `claim(id)` returns the text and throws on an
unknown id, so a typo is a build failure rather than an empty paragraph.

`claims.test.ts` asserts, each with a positive control that proves the assertion can fire:

- every `epic` has `docs/epics/reports/<epic>-report.md`;
- every `evidence` path exists;
- no claim text matches the **denylist** — `SOC 2`, `lesson`, `per seat`, `SSO`, `SAML`,
  `audit log`, `shared blok library`, `co-founder`, `we are hiring`;
- ids are unique and every id in the registry is rendered by some page (no dead claims).

### 2. Six pages

Each is a server component under `apps/web/app/`, assembled from `claim(...)` calls and the
mockup's layout primitives. `metadata` with a canonical URL on each.

| route | what it says, and where the facts come from |
|---|---|
| `/features` | The twelve `.strip` items, re-derived: blok canvas (021a), per-blok compilation (020), edited-by-hand spans (021b), decompiler (013), diagnostics (012a/012b), multi-range bloks (011a), three providers (042), checks (030), judge (033), attribution (032), semantic diff (040), A/B (041), publish gate (051), CLI (053), two SDKs (052/054). |
| `/delivery` | The mockup's strongest page and the most nearly true. Before/after/safety strip, the four setup steps with **the real commands**, the blocked-publish card with EPIC-051's **four real gate rows** (checks and contract block; cost and diff report), undo, bundled fallback, the audit log. |
| `/docs` | Quickstart, the five real `41p` commands, the two SDKs, and a CI snippet using `41p check` — **not** `41p run`, which does not call a model (EPIC-053 §8). |
| `/security` | Six items, SOC 2 removed: BYO keys sealed at rest (042/043), we are not in your traffic path (052), fails safe (052/054), publishing is gated on checks (051), retention numbers **imported from the constants that enforce them** (EPIC-017's pattern), and the two threat models linked. |
| `/changelog` | Derived. `CHANGELOG_ENTRIES` is built from the epics that have reports, grouped by stage, each line the epic's one-sentence goal. No invented dates or versions; the newest tag is stated as what it is. |
| `/guides` | An index. One real guide exists; the page says so and links it, and links `/decompile` and `/docs`. No fabricated cards. |

### 3. `/legal/third-party-notices`

`scripts/third-party-notices.mjs` runs `pnpm licenses list --json` (the same source
`scripts/license-gate.mjs --sbom` reads) and writes
`apps/web/lib/site/third-party-notices.generated.json`. The page renders it grouped by licence.
`third-party-notices.test.ts` re-runs the command and fails when the committed file is stale —
measured at 1.2s, so it is a test and not a script nobody runs.

### 4. Chrome

- `lib/site/links.ts` gains the new destinations and keeps its "no 404" contract.
- `site-chrome.tsx`'s nav gains **Features · Delivery · Docs · Decompiler**, which discharges the
  comment in that file naming this epic. Pricing and Learn stay out: they have no page.
- The footer grows a Product / Resources / Legal / Elsewhere grid.
- **This moves both `landing-*-linux.png` baselines.** Regenerate in
  `mcr.microsoft.com/playwright:v1.63.0-noble`, per `docs/PROCESS.md` and EPIC-056 §4.4.

### 5. Ask-AI chips

`apps/web/app/ask-chip.tsx` — a client component. A chip opens a sheet whose textarea shows
**exactly** the text that will be sent (the mockup's own label, and the property worth keeping), four
destinations opening in a new tab with `noopener`, and Copy instead. Escape and the scrim close it.
No network call of ours, nothing logged.

### 6. Reduced motion, links, Lighthouse

- `apps/web/e2e/site-pages.spec.ts`: every public route answers 200 and has one `<h1>`; every nav and
  footer link answers 200; the same under `reducedMotion: "reduce"` with the end state asserted.
- `lighthouse` as a **devDependency** of `apps/web`, run by hand against the built app during the
  drive. Not in `gates.mjs`: it needs a running server and a browser and would double the gate.
  Reason for the commit message: *the Tests line names Lighthouse and nothing else in the repository
  measures performance, accessibility, best practices or SEO on a rendered page.*

### 7. Gate, drive, merge, report

`node scripts/gates.mjs ci` on the commit; `turbo run build --filter=@41prompts/web` then
`next start -p 3111`; `scripts/drive-epic-072.mts` walks all eleven public routes at 1440 and 390,
light and dark, screenshots into `docs/epics/reports/screenshots/EPIC-072/`; merge `--no-ff`.

## Traps this plan is written around

- **A claim can be true and still unmappable.** "Your app never waits on us" is EPIC-052's, provable.
  "We are not in your traffic path" is architecture, provable. "SOC 2 in progress" is neither — it
  is a statement about a process nobody started. The denylist is the mechanical half; the registry's
  `evidence` column is the half a reader can check.
- **`page.test.tsx`'s number guard** (EPIC-056 §4.7) fires on any number that is not a fact about the
  product. The new pages carry prices per million tokens and retention day counts; each has to be
  listed with its reason, which is the guard working.
- **Forbidden words.** `scripts/forbidden-words.mjs` reads `apps/web`. The mockup's copy is full of
  "block", "assertion", "override" and "drifted". Every sentence is re-worded before it is committed,
  not after the gate says so.
- **Lesson 8.** Every assertion about an absence — no SOC 2, no dead claims, no stale notices file —
  gets a positive control that proves it can fire.
