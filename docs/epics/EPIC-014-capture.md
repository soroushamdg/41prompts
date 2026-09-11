# EPIC-014: Capture and abuse control
Stage: 1 · Depends on: EPIC-013, EPIC-017 · Size: S

## Goal
A decompile can be shared by link, and the page can survive being found. Permalinks with a purge window, rate
limits, an abuse check before any provider call, and a waitlist that captures interest without a signup wall.
Nothing here is a feature the user asks for; all of it is what makes EPIC-015's soft launch survivable.

## Standing note
EPIC-005 and EPIC-080 are cut. The 30-day funnel is the only signal. The share rate this epic enables is half of
M1's kill criterion (300 unique decompiles, ≥15% share-or-waitlist), so the share control is not decoration.

**Carried from EPIC-013**: a textarea submission is normalised to CRLF by the browser regardless of the author's
editor. Whatever is stored here is CRLF. Every hash, diff, byte count and permalink fidelity check must be written
knowing that; do not normalise on the way in, because the offsets in a stored decompile were computed against the
CRLF text the server actually received.

## Decisions (do not re-litigate)
1. **Permalink**: `/d/<id>`, id is `dc_` + 12 hex, unguessable, not sequential. Server-rendered from the stored
   source; the decompile is recomputed, never cached as HTML, so a core fix improves every existing link.
2. **`noindex, nofollow`** on every permalink, plus a `X-Robots-Tag` header. The shared link is for a colleague,
   not for Google. `/decompile` itself is indexable; a permalink is not.
3. **Retention 30 days**, then hard purge by a daily pg-boss job. Stated on the page before the user shares, in
   one plain sentence. A `deleted_at` soft delete is not enough here; the row goes.
4. **Removal endpoint**: anyone holding the link can delete it, from the page, with no account. One click, a
   confirm, gone. This is the answer to "I pasted something I should not have".
5. **Rate limits**, per IP and per session, on decompile and on permalink creation. Limits are named constants.
   Exceeding one returns a calm message with the limit named, never a silent failure and never a CAPTCHA on the
   first offence.
6. **Turnstile** on permalink creation only, not on decompiling. Making someone prove they are human before they
   have seen any value is how the funnel dies.
7. **Abuse check before any provider call.** Today the only provider call is the worker's summariser. A pasted
   prompt is user content of unknown provenance: size cap, a check that it is not obviously an attempt to use us
   as a free inference endpoint, and a hard per-IP budget. If the check fails, the heuristic summary is used and
   nothing reaches a provider.
8. **Waitlist**: email only, one field, on the result page, framed as "tell me when the editor ships". Stored in
   our Postgres, double opt-in is not required for a waitlist but an unsubscribe path is. No marketing automation.
9. **No account, ever, on this route.** Anything requiring sign-in belongs to Stage 2.
10. Analytics events for this route are declared in EPIC-004's closed set and wired in EPIC-015, not here. This
    epic must make them possible without firing them.

## Scope
- `packages/db`: `decompiles` (id, source, created_at, ip_hash, user_agent_hash), `waitlist` (id, email,
  created_at, unsubscribed_at). IP is stored hashed with a per-deployment salt, never raw.
- `apps/web`: share control on the result page, `/d/<id>` route, removal endpoint with confirm, waitlist form,
  rate-limit middleware, Turnstile on the create path.
- `apps/worker`: `purge-decompiles` daily job, idempotent, logs counts; the abuse check in front of the summariser.
- The retention sentence and the removal affordance as product copy, written for a stranger.
- `infra/README.md`: the Turnstile keys and the IP salt as Coolify variables, asked for in one batched checklist.
- **Carried defect**: `segment.perf.test.ts`'s growth-exponent gate has flaked twice (1.74 against a 1.6 bar on CI,
  1.10 locally). Decide it deliberately here rather than while finishing something else: either make the
  measurement robust (more iterations, median of runs, discard the slowest) or move it out of the failing set into
  a reported number, as EPIC-010's 1 MB timing already is. Do not simply widen the bar ; that trades regression
  sensitivity for a quiet CI, which is the wrong trade. Say which you chose and why.

## Out of scope
- `llms.txt`, the companion article, the PostHog funnel, Search Console. (EPIC-015.)
- Accounts, saving a decompile to a project. (Stage 2.)
- Editing a permalinked decompile.
- Any paid plan or quota. (EPIC-070.)

## Acceptance criteria
- [ ] Sharing produces `/d/<id>`; opening it in a clean browser renders the same bloks and findings as the
      original. Evidence: e2e test name.
- [ ] A permalink carries `noindex, nofollow` in both the meta tag and the `X-Robots-Tag` header. Evidence: the
      response headers.
- [ ] The purge job deletes a decompile older than 30 days and not one day younger, with an injected clock.
      Evidence: two test names.
- [ ] The removal endpoint deletes the row and subsequent loads return 404. Evidence: test name.
- [ ] The retention window and the removal option are stated on the page before the share control. Evidence:
      screenshot.
- [ ] Rate limits fire per IP and per session, return a message naming the limit, and reset. Evidence: three test
      names.
- [ ] Turnstile guards permalink creation and nothing else; decompiling without it still works. Evidence: two test
      names.
- [ ] The abuse check runs before the summariser; when it fails, no provider call is made and the heuristic
      summary is returned. Evidence: test name with the provider client asserted not called.
- [ ] Waitlist stores an email, rejects a duplicate calmly, and offers an unsubscribe path. Evidence: three test
      names.
- [ ] IP addresses are stored hashed; a grep over the database schema and the logs finds no raw IP. Evidence:
      schema and the grep.
- [ ] A permalinked source containing CRLF, tabs, emoji and RTL text renders with identical ranges to the original
      submission. Evidence: four fixtures.
- [ ] The perf-gate decision is implemented and explained; CI runs green three times consecutively. Evidence: the
      three runs.
- [ ] Axe clean, full keyboard operation, 44px targets on the new controls; no green, red or amber on the route.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Deployed to staging; share, open, remove and waitlist driven by hand with screenshots in the report.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- EPIC-017 (legal minimum) is a dependency on paper but has not been built. If the retention sentence needs a
  privacy policy to point at and none exists, say so in the report and write the sentence so it stands alone;
  do not block.
- The removal path is the one a worried person uses. It must be findable without reading anything.
- The abuse check is not a content filter and must not become one. It exists to stop us paying for someone else's
  inference, nothing more.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-014.md` and stop.
