# EPIC-016: Landing page v1
Stage: 1 · Depends on: EPIC-003, EPIC-013 · Size: M

## Goal
One page that makes an AI engineer who owns a production prompt paste it into the decompiler within thirty
seconds. Nav, hero, a three-step strip, the decompiler call to action, footer, and the sign-in and sign-up pages
that Stage 2 will need. Nothing else.

## The position, decided
**The hero leads with the failure, not the tool** (Soroush, 2026-09-11). The reader recognises the situation before
they are told what we sell. But it is stated as a fact about how prompts ship, never as a threat and never as an
accusation about their team ; a fear opening over a product that does not deliver in one click reads as
manipulation, and this reader is sceptical by profession.

Hero, in this shape:
- **Headline**: the failure, plainly. "A prompt change ships. Nothing checks it. You find out from a user."
- **Subhead**: what this does about it, in one sentence, naming bloks and checks.
- **Immediately below**: the ask bar ; a textarea that submits straight to `/decompile`. No signup, no email, no
  "book a demo". The proof is one paste away and must be visible without scrolling on a laptop.

The exact words are the implementer's to draft and mine to approve; the report lists the alternatives rejected,
as EPIC-012b's copy did.

## Decisions (do not re-litigate)
1. Server-rendered, `packages/ui` components only, Resolution tokens. No new design language, no stock imagery.
2. **The ask bar is the primary action on the page and the only one above the fold.** Sign in is in the nav,
   small. Sign up is not promoted at all; there is nothing to sign up for until Stage 2.
3. **Three-step strip**: paste → see the bloks and what nothing checks → fix it before it ships. Three lines, no
   icons-as-decoration, no carousel.
4. **No social proof that does not exist.** No logos, no "trusted by", no invented counts, no testimonials. A
   placeholder testimonial on a pre-launch page is a lie and this audience spots it instantly.
5. **No fake urgency, no countdown, no "limited beta" unless the beta is actually limited.**
6. Footer: legal pages as links (terms, privacy, security, sub-processors), GitHub, contact. Pages that do not
   exist yet link to a plain "coming before launch" stub rather than a 404, and EPIC-017 fills them.
7. **Sign in and sign up pages** exist and work against EPIC-002's auth, styled with the design system. Sign up
   leads to the empty `/app`. That is the whole of it; no onboarding, no tour.
8. Logo: the 41 → AI animation from `docs/design/41prompts-logo-v2.html`, with the static plate as favicon.
   `prefers-reduced-motion` shows the end state. The animation runs once on load, not on a loop.
9. Metadata: title, description, Open Graph and Twitter card with a static generated image, canonical URL,
   `sitemap.xml`, `robots.txt` allowing `/` and `/decompile`, disallowing `/d/`.
10. Performance is a feature for this reader: no client-side framework work on the critical path, images sized and
    lazy below the fold, fonts self-hosted with `font-display: swap`.
11. Analytics events stay declared-not-fired (EPIC-004's closed set); EPIC-015 wires the funnel.

## Scope
- `apps/web/app/page.tsx`, nav, hero with ask bar, three-step strip, decompiler CTA, footer.
- `/sign-in`, `/sign-up` styled against `packages/ui`; the existing auth flows unchanged.
- Legal stubs for the four footer pages.
- Logo component with the animation; favicon set.
- Metadata, Open Graph image, `sitemap.xml`, `robots.txt`.
- Copy for every string on the page, with rejected alternatives in the report.

## Out of scope
- Pricing, features, delivery, learn, docs, about, changelog, blog, guides, careers, contact pages. (EPIC-072.)
- Real legal text. (EPIC-017.)
- `llms.txt`, the companion article, Search Console, any announcement. (EPIC-015.)
- Testimonials, logos, counters, any social proof.
- A/B testing infrastructure.

## Acceptance criteria
- [ ] The ask bar is visible without scrolling at 1280×800 and at 375×812, and submitting it lands on
      `/decompile` with the text intact, including CRLF, tabs, emoji and RTL. Evidence: two screenshots and four
      fixtures.
- [ ] Nav, hero, three-step strip, CTA and footer render in light and dark; visual regression snapshots committed.
      Evidence: the snapshots.
- [ ] `/sign-in` and `/sign-up` work end to end against staging with Google, GitHub and a magic link. Evidence:
      three e2e test names or three screenshots.
- [ ] Every footer link resolves ; real page or stub, never a 404. Evidence: the link check.
- [ ] Logo animates once on load and shows its end state under `prefers-reduced-motion`. Evidence: two test names.
- [ ] Metadata complete: title, description, canonical, Open Graph image renders in a validator, `robots.txt`
      allows `/` and `/decompile` and disallows `/d/`, `sitemap.xml` lists only real pages. Evidence: the files and
      one validator screenshot.
- [ ] Lighthouse on the deployed staging page: performance ≥90, accessibility 100, best practices ≥95, SEO 100.
      Evidence: the report.
- [ ] Axe clean in both themes; full keyboard operation; 44px targets; no green, red or amber anywhere.
- [ ] Forbidden-word grep passes over every string on the page.
- [ ] No testimonial, logo, counter or claim on the page that is not literally true today. Evidence: a line in the
      report confirming the check was made deliberately.
- [ ] `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm e2e`, `pnpm compliance`, `pnpm binary-files` clean.
- [ ] Deployed to staging with screenshots at both viewport sizes in the report.
- [ ] Report and session log written; backlog updated.

## Notes for the implementer
- `docs/design/41prompts-full-mockup.html` is the spec for the home page; take its structure and tokens, and apply
  `docs/design/README.md`'s corrections where they conflict.
- The headline is the highest-stakes sentence in the product. Draft five, ship one, list the other four and why
  they lost.
- Do not write copy that promises anything Stage 1 cannot do. The editor does not exist yet; say so if the page
  needs to mention it at all.
- If a criterion is impossible, write `docs/epics/BLOCKER-EPIC-016.md` and stop.
