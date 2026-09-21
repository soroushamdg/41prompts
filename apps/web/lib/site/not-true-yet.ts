/**
 * The things `docs/design/41prompts-full-mockup.html` says and the product does not do.
 *
 * Each pattern was read off the mockup, not imagined: SOC 2 Type I "underway"; nine lessons; a
 * shared blok library; SSO/SAML; roles and an audit trail; retention "per project"; per-seat
 * prices; a second co-founder; three open positions. The mockup is the spec for the interface
 * (`docs/design/README.md`) and not for what is true about the company.
 *
 * ## Why it lives here and not in the test that used to own it
 *
 * EPIC-072 wrote this list inside `claims.test.ts`, where it guarded the **registry**: no sentence
 * in `claims.ts` may match one. EPIC-016b's acceptance criteria then asked for the same list to run
 * over the home page's **rendered text**, because a page can carry a sentence that never went
 * through the registry — a heading, a caption, the word on a tab.
 *
 * A second copy in `page.test.tsx` would be two answers to "what are we not allowed to say", and
 * the one that drifts is whichever file somebody is not editing. So the list moved out of the test
 * and into a module both can read. It is data, not behaviour: nothing in the running app imports
 * it, and nothing should.
 *
 * ## `CONTROLS` is not optional
 *
 * Every use of this list is an `expect(...).not.toMatch(...)`, which passes when the page is clean
 * and would also pass if a pattern had been narrowed until it matched nothing at all. `CONTROLS`
 * pairs each pattern with **the mockup's own sentence**, asserted to still match, so a narrowed
 * pattern fails here first (`CLAUDE.md`: every absence assertion needs a positive control).
 */
export const NOT_TRUE_YET: readonly (readonly [string, RegExp])[] = [
  ["a compliance certification", /\bSOC\s*2\b|\bISO\s*27001\b|\bHIPAA\b|\bFedRAMP\b/i],
  ["lessons", /\blessons?\b/i],
  ["a per-seat price", /\bper seat\b|\$\d+\s*(?:a|per|\/)\s*(?:month|seat)/i],
  ["single sign-on", /\bSSO\b|\bSAML\b|\bSCIM\b/i],
  ["roles or an audit trail", /\brole-based\b|\baudit (?:trail|log)\b/i],
  ["a shared library", /\bshared blok library\b/i],
  ["per-project retention control", /\b(?:retention|retained|kept|redacted|dropped)\b[^.]*\bper project\b/i],
  ["a team", /\bco-founders?\b|\bour team\b|\bwe are hiring\b/i],
  ["a customer count", /\b\d[\d,.]*\s*(?:\+|k\b|m\b)?\s*\b(?:companies|teams|engineers|developers|users|customers)\b/i],
  ["an award", /\b#1\b|\baward\b|\bbest[- ]in[- ]class\b|\bmarket[- ]leading\b/i],
  ["a trust badge", /\btrusted by\b|\bused by\b|\bloved by\b/i]
];

/** The mockup's own sentences, each of which one pattern above must go on matching. */
export const NOT_TRUE_YET_CONTROLS: readonly (readonly [string, RegExp])[] = [
  ["SOC 2 in progress. Type I underway.", /\bSOC\s*2\b/i],
  ["Nine lessons. All of them run in the product.", /\blessons?\b/i],
  ["$29 per seat / month", /\bper seat\b|\$\d+\s*(?:a|per|\/)\s*(?:month|seat)/i],
  ["SSO / SAML", /\bSSO\b|\bSAML\b/i],
  ["Roles and audit log", /\baudit (?:trail|log)\b/i],
  ["Shared blok library", /\bshared blok library\b/i],
  ["Run payloads can be kept, redacted or dropped per project.", /\b(?:retention|retained|kept|redacted|dropped)\b[^.]*\bper project\b/i],
  ["Co-founder. Engineering.", /\bco-founders?\b/i],
  ["Trusted by 1,200 teams", /\btrusted by\b/i]
];
