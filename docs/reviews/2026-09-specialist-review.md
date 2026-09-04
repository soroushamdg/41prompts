# Specialist review · September 2026

Five reviews were run against the backlog, roadmap, ADRs, process and prototypes: product strategy, legal,
licensing, project management, UX research. This file records what was adopted, what was rejected, and why.
Rejections are decisions, not omissions; reopen one only with a written reason.

## Adopted

### Strategy
- **ICP locked: AI engineers at companies (10–500 people) who own a production prompt.** Newcomers are served only as the junior members of those teams. Every surface, price and lesson is written for the engineer who already has a failing prompt in production.
- **Lessons move to the last stage, after billing.** Not cut. Teaching is a retention and onboarding feature for the ICP's junior members, not an acquisition channel for students.
- **Stage 1 ships the decompiler "soft-public":** live, indexed, no announcement. The loud launch (HN, Product Hunt) moves to after Stage 3, when a paste can lead somewhere.
- **Stage 5 splits into 5a (minimum delivery: artifact, gate, API, TypeScript SDK) and 5b (CLI codegen, Python SDK, open-source split, threat model)**, with a demand gate between them.
- **New epics:** customer discovery (EPIC-005), activation onboarding (EPIC-034), metrics dashboard and kill criteria (in EPIC-004 and the roadmap).
- **Leading metric and kill criterion per milestone** added to the roadmap.
- Pricing stays $29 / $79 per seat as a placeholder; validated in EPIC-005 before Stripe is built.

### Legal
- **New EPIC-017 "Legal minimum"** in Stage 1, blocking any public traffic: terms, privacy policy naming OpenAI/Anthropic/Google as recipients, cookie choice, sub-processor page, retention table, Law 25 transfer note, DPA-on-request draft.
- **Retention enforcement moves to where the data appears:** anonymous decompiles purged at 30 days (EPIC-014), raw run payloads default 12 months (EPIC-031), account purge window (EPIC-002).
- **Permalinks:** `noindex` by default and a "remove this content" endpoint open to anyone (EPIC-014).
- **Abuse check before forwarding anonymous text to a provider on our key** (EPIC-014).
- **BYO-key threat model and breach runbook before EPIC-042 ships**, not in Stage 5.
- **SDK telemetry is off by default.** The "apps calling this prompt" view is derived from CDN access logs, which need no client ping.
- **DCO, not CLA**, for the public mirror (EPIC-056).
- **Trademark knockout search now** (EPIC-006); word-mark filing in Canada and the US before the loud launch.
- Hetzner region fixed to EU (Falkenstein) in EPIC-001; documented in the privacy policy.

### Licensing
- **Apache-2.0 replaces MIT** for the public packages: express patent grant, trademark clause, NOTICE that travels with forks.
- `packages/ui` is explicitly proprietary. shadcn-derived files keep their MIT notice under one directory.
- **`packages/sdk-ts` publishes as `@41prompts/sdk`.** Thin unscoped `41p` and `41prompts` packages published at 5b.
- **Judge prompts, summariser prompts and drift heuristics stay proprietary** (in `apps/worker`, or `packages/engine` if a pure package is needed). `packages/core` holds only what we are content to see forked.
- Namespace reservations this week: npm org `@41prompts`, GitHub org `41prompts`, PyPI `fortyone-prompts` (+ `fortyone`, `41prompts` if free). EPIC-006.
- Compliance CI (SPDX headers via REUSE, allow-list boundaries, SBOM + licence gate, mirror dry-run) is its own epic (EPIC-007) so EPIC-000 stays small.
- Python SDK: zero dependencies, standard library HTTP.
- Fonts self-hosted via `next/font`; no Google Fonts CDN.
- `41p decompile <file>` added to the CLI, since an open decompiler was the stated reason to open-source core.
- Copyright holder is a placeholder `<legal entity>` until incorporation; IP assignment from founder to company is a task in EPIC-056.

### Project management
- Dependency fixes: EPIC-040 depends on 032; 021a and 021b depend on 003.
- EPIC-011 and EPIC-012 each split into an M and an S.
- PROCESS.md gains: blocker rule with 24-hour decision, session log, weekly review, definition of `blocked`, bug routing, stage gates.
- Explicit go/no-go gates after Stage 1 and Stage 3.

### UX research
- **The word "block" is eliminated.** A blok owns *spans* of the compiled prompt. "Blok" and "block" one letter apart in the same sentence was a naming defect. Code, schema, UI and docs use `blok` and `span` only. (ADR-003)
- **"Check" replaces "assertion" in every user-facing string.** "Assertion" survives only as an internal type name.
- Vocabulary fixes: "enum" → "one of the allowed values"; `json_schema` → "valid JSON shape"; "drifted" badge → "edited by hand"; "Reconcile" → "Update from blok"; "Override with a reason" → "Publish anyway"; "labelled" → "named"; no bare shas in UI.
- **Amber is reserved for drift only.** "Unsaved" and cost deltas use neutral ink.
- Accessibility items assigned to owning epics: skip link and no per-word tab stops in the source map, keyboard pin from the span side, ARIA tabs, focusable heatmap cells with labels, icons alongside pass/fail colour, `aria-valuetext` on sliders, 44px touch targets, reduced-motion showing end states (the hero and logo prototypes get this wrong).
- **Three research epics, not eleven:** EPIC-080 (terminology, touch, summary trust; one 12-participant study before Stage 1 code), EPIC-090 (override mental model, canvas scale, Draft/Live IA; before EPIC-021b), EPIC-084 (live funnel and blok-count distribution read; after 015).
- Lesson validation with two newcomers moves before EPIC-061 content is written, using a paper prototype.

## Rejected, with reasons

- **Cut the public decompiler (product review).** Rejected. It is the only feature with no competitor and no run cost, it produces the blok-count data the canvas design needs, and it is the AI-citation surface. Softened instead: no announcement until Stage 3.
- **Cut lessons entirely (product review).** Rejected; deferred. The founder's intent for the product includes teaching, and the ICP has junior members. Built last, after revenue.
- **Price at $499 / $2,999 per month (product review).** Rejected as unsupported; no evidence was offered. Validate in EPIC-005.
- **Defer the whole SDK until customers ask (product review).** Rejected in part. The TypeScript SDK is the proof of the gate story and the founder's stated core feature; it ships in 5a. Codegen, Python and the open-source split wait for the demand gate.
- **Source-available licence for core (licensing review considered and rejected it; concur).** Kills SDK trust under standard dependency scanners.
- **Eleven separate research epics (UX review).** Consolidated to three; a solo founder cannot run eleven studies.
- **Two epics per week (project review's compressed scenario).** Rejected; the one-epic-one-session rule stands.

## Open items for Soroush

1. Incorporate, or confirm the legal entity name, before EPIC-056. Until then `<legal entity>` is a placeholder in LICENSE, NOTICE and SPDX headers.
2. Reserve the npm org, GitHub org and PyPI names this week (EPIC-006 lists the exact commands).
3. Book one hour with a Québec-barred lawyer for EPIC-017; budget CAD 500–800.
4. Decide whether the trademark filing happens at EPIC-006 (before public traffic, recommended) or at the loud launch.
