# EPIC-015: Soft ship
Stage: 1 · Depends on: EPIC-014, EPIC-016 · Size: S

## Goal
Make the decompiler findable, make its use measurable, and then leave it alone for thirty days. No announcement,
no Show HN, no Product Hunt. This epic starts the clock on M1's kill criterion ; 300 unique decompiles in 30 days
with ≥15% share-or-waitlist ; which is now the **only** evidence the wedge is right, because EPIC-005 and
EPIC-080 are cut.

## Why soft, and why it matters more than usual
A loud launch converts attention you only get once. Spending it on a product with no editor, no runs and no
accounts wastes it. A soft ship tests whether the decompiler is findable and useful on its own ; if 300 people
find it without being told, the wedge is real; if 40 do, announcing louder would have produced 40 disappointed
people instead of 40 curious ones.

The discipline this epic actually requires: **resist looking at the number daily and resist changing the product
during the window.** A thirty-day measurement with three product changes inside it measures nothing.

## Decisions (do not re-litigate)
1. **No announcement of any kind** during the window. No HN, no Product Hunt, no Twitter, no LinkedIn, no Reddit,
   no newsletter. If someone finds it and posts it, that is a signal, not a breach.
2. **Production is where this happens.** Everything ships to `app.41prompts.ai` and `41prompts.ai` via a `v*` tag.
   The staging URL is not advertised.
   **Amended 2026-09-13:** this read "the staging URL stays private". It is not private — it appears
   throughout a public repository (`infra/`, `docs/`, this file). Not advertising it is the actual
   decision and the only one that was ever enforceable; the site itself is behind a session.
3. **`llms.txt`** at the root, plus `llms-full.txt` if the content warrants it: what 41Prompts is, what the
   decompiler does, the six finding kinds in plain language, and the fact that no account is needed. This is how
   an AI assistant answering "how do I check my prompt for contradictions" finds you. Written for a model reading
   it, not for a crawler being gamed.
4. **One companion article** at `/guides/what-your-prompt-does-not-check` (or similar): the six findings, each
   with a real example from our own corpus, and a link to paste your own. Indexable, canonical, no gate. It is the
   only content asset and it exists to be the landing page for search and for AI citation.
5. **PostHog funnel**, using only the event names already declared in EPIC-004's closed set: `decompile_view`,
   `decompile_run`, `decompile_share`. Plus the waitlist submission. The funnel is
   view → run → (share or waitlist). Anonymous; no identify, no PII, consent flag respected.
6. **Search Console** verified for `41prompts.ai`, sitemap submitted, and the same for Bing Webmaster Tools ;
   Bing feeds several AI assistants and costs ten minutes.
7. **The counter is checked weekly, not daily**, and the date the window closes is written down now. EPIC-084 reads
   the result and GATE 1 decides on it.
8. **Nothing about the product changes during the window** except a defect that makes the decompiler wrong or
   unavailable. A copy tweak, a new finding, a layout change ; all wait. Write that rule into the epic report so
   the next session honours it.
9. Analytics respect Do Not Track and the EPIC-017 consent flag; a visitor who declines is not counted, and the
   report says so, because the 300 will be an undercount and we should know by roughly how much.

## Scope
- `apps/web/public/llms.txt` (and `llms-full.txt` if warranted), generated or committed, listed in `robots.txt`.
- The companion article as a real page with metadata, canonical URL, Open Graph image, and a link into
  `/decompile`. Its examples come from the committed corpus, never invented.
- PostHog: wire the three declared events plus waitlist submission; build the funnel; confirm each fires once and
  only once.
- Google Search Console and Bing Webmaster Tools verification, sitemap submitted to both.
- `docs/research/m1-window.md`: the start date, the close date, the criterion verbatim, a weekly table to fill in,
  and the no-changes rule.
- Production deploy by `v*` tag; verify `41prompts.ai`, `/decompile`, `/d/<id>` and the article all work in
  production, not only staging.

## Out of scope
- Any announcement, outreach, or paid acquisition. (EPIC-035, after GATE 3.)
- More content than the one article. (EPIC-072.)
- Newsletter, email marketing, drip sequences.
- Product changes of any kind during the window.
- Accounts, editor, runs. (Stages 2 and 3.)

## Acceptance criteria
- [ ] `llms.txt` is reachable at the production root, is valid, names the six finding kinds in plain language, and
      states no account is needed. Evidence: the file and a fetch.
- [ ] The companion article is live in production, indexable, canonical, with an Open Graph image and a working
      link into `/decompile`. Every example in it comes from the committed corpus. Evidence: URL and screenshot.
- [ ] `decompile_view`, `decompile_run`, `decompile_share` and the waitlist event each fire exactly once per
      action in production, with no PII in any payload. Evidence: four PostHog event payloads with ids redacted.
- [ ] The PostHog funnel exists and shows view → run → share-or-waitlist. Evidence: screenshot, zeros acceptable.
- [ ] A visitor who declines consent or sends Do Not Track produces no events. Evidence: test name.
- [ ] Search Console and Bing Webmaster Tools both verified, sitemap submitted to both. Evidence: two screenshots.
- [ ] Production serves `41prompts.ai`, `/decompile`, a real `/d/<id>` and the article, all over TLS, all with
      correct robots directives (`/d/` still `noindex`). Evidence: four fetches.
- [ ] `docs/research/m1-window.md` exists with the start date, the close date thirty days later, the criterion
      verbatim, an empty weekly table, and the no-changes rule stated.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Report and session log written; backlog updated; EPIC-084 marked as blocked until the close date.

## Notes for the implementer
- The article is the highest-leverage writing in Stage 1 after the headline. It is read by a sceptical engineer and
  by a model deciding whether to cite you. Be concrete, use the real examples, claim nothing the product cannot do.
- `llms.txt` is a young convention; follow the emerging format, keep it short, and do not stuff it.
- Do not invent a metric, a testimonial or a count anywhere in this epic.
- After the production deploy, the correct next action is to stop. Say so in the report.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-015.md` and stop.
