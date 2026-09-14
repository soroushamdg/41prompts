# EPIC-017: Legal minimum
Stage: 1 (carried) · Depends on: EPIC-002 · Size: M

**This epic file was never written.** The backlog row and `roadmap.md`'s task line existed from the
start; the file that Claude Code builds from did not, which is part of how the epic got carried past
EPIC-014 and EPIC-015 unmet. Written 2026-09-14, by Soroush's instruction, alongside the work.

## Goal
The public site tells the truth about what it collects, keeps and does with a person's data, in
writing, on pages that are actually written — and a visitor can decline the non-essential part
before it happens rather than after.

## The ruling this is built under (2026-09-14)

**No lawyer.** Soroush is shipping a portfolio project with no users and does not want a legal
dependency in the critical path. All of it is drafted here, from research rather than from a
template, and **the terms and privacy pages each carry one line at the top saying they have not been
reviewed by a lawyer.** That line is the difference between a draft and a misrepresentation. It goes
nowhere else — no warnings scattered through the site, no hedging in the body text.

## Scope
- **Cookie choice.** The only part with real exposure and the only part that is a build. Non-essential
  off by default, no dark patterns, keyboard operable, and it gates what it claims to gate.
- **Terms of service**, with the four clauses that matter for this product: the licence for pasted
  prompts, the warranty disclaimer, the liability cap, and Québec governing law.
- **Privacy policy**, naming every processor, the retention table, the Law 25 privacy-officer
  contact, the GDPR rights contact, and the cross-border note.
- **Sub-processor page**, every third party that touches data, what it does and where it is.
- **Security page**, which already has a footer link and a stub.
- **Retention table**, with every number matching the constant that enforces it, and the file cited.

## Out of scope
- A DPA-on-request draft, a Law 25 transfer assessment as a separate document, and the lawyer hour.
  The roadmap listed all three; the ruling removes the lawyer, and the other two are documents for a
  service with business customers, which this is not yet. **EPIC-071 carries them.**
- Any change to what is collected. This epic describes and gates; it does not re-architect.
- A copyright line in the footer. `CLAUDE.md` keeps the holder as `<legal entity>` until
  incorporation, and a © naming a company that does not exist is the claim EPIC-016 decision 4 rules
  out. It arrives with incorporation, not here.

## Decisions (do not re-litigate)
1. **Non-essential is off until someone says yes, and the default survives the banner being
   ignored.** A visitor who never answers is a visitor who never consented. The mechanism for this
   already exists and is already correct — `hasAnalyticsConsent` in `lib/analytics/posthog-server.ts`
   — and what is missing is the control that lets a person set it, and change it later.
2. **No dark patterns, stated concretely so it is checkable:** Allow and Decline are the same size,
   the same weight and the same colour treatment; neither is pre-selected; declining is one click
   from the banner, not hidden behind "manage preferences"; and the banner does not reappear on every
   page once answered.
3. **A choice can be changed.** Law 25 and GDPR both require withdrawal to be as easy as consent, so
   the control lives somewhere permanent as well as in the banner.
4. **`DNT` and `Sec-GPC` outrank the banner** and always have. A visitor sending either is never
   counted, whatever the cookie says, and the privacy page says so.
5. **The retention table is generated from the constants, not typed.** Every number is imported from
   the module that enforces it, so a page that disagrees with the code cannot be written. The one
   number that has no code yet — raw provider payloads, 12 months — is stated as **not yet built**,
   naming EPIC-031, rather than written as current behaviour.
6. **Processors are named from the code**, not from memory. A processor listed that we do not use is
   as wrong as one we use and do not list.
7. **The pages are prose, not a component library.** They use `prose-page`, which exists.

## Acceptance criteria
- [ ] Non-essential analytics do not fire for an anonymous visitor who has not chosen. Evidence:
      existing unit tests plus an e2e test asserting no request reaches the analytics host before a
      choice.
- [ ] The banner offers Allow and Decline with equal prominence, neither pre-selected, and is fully
      keyboard operable. Evidence: test names, plus the axe check.
- [ ] Choosing dismisses the banner and the choice survives a reload and a navigation. Evidence: e2e.
- [ ] A choice can be changed afterwards from a permanent control. Evidence: e2e.
- [ ] `DNT: 1` and `Sec-GPC: 1` suppress analytics regardless of the cookie. Evidence: existing unit
      tests, named in the report.
- [ ] Terms, privacy, sub-processors and security render real content, and are indexable. Evidence:
      e2e, and the `noindex` line removed.
- [ ] Terms and privacy each carry the not-reviewed-by-a-lawyer line, once, at the top. Evidence:
      test name. No other page carries a warning.
- [ ] Every retention number on the page equals the constant that enforces it, and names the file.
      Evidence: a test that imports both and compares, so the page cannot drift from the code.
- [ ] The 12-month payload retention is described as not yet built, naming EPIC-031. Evidence: test.
- [ ] Every processor named is one the code actually uses. Evidence: the list in the report, checked
      against the code.
- [ ] Axe clean in both themes on every new page and on the banner; 44px targets.
- [ ] Forbidden-word grep passes over every new string.
- [ ] `pnpm test`, `typecheck`, `lint`, `e2e`, `compliance`, `binary-files` clean.
- [ ] Driven in a browser against the built app, then on staging after the deploy.
- [ ] Report and session log written; backlog updated.

## Verification
`pnpm test && pnpm typecheck && pnpm lint && pnpm e2e`, then the drive.

## Notes for the implementer
- The consent gate is built. Read `lib/analytics/posthog-server.ts` before writing anything: it
  already honours `DNT`, `Sec-GPC` and the cookie, and it already defaults an anonymous visitor to
  off in production. The job is the control, not the gate.
- **One asymmetry to report rather than silently change**: `hasAnalyticsConsent` grants for a
  signed-in user in production who has never chosen. That is EPIC-004's tested decision, so it is not
  changed here; the banner is shown to everyone, declining wins for everyone, and the report asks
  whether consent should be universal.
- `RUN_COUNT_RETENTION_DAYS = 180` exists and is enforced in `purge-decompiles.ts`. It is a fourth
  retention number nobody's brief mentioned; it belongs in the table.
