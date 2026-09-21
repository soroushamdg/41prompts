import publicRoutes from "./public-routes.json";

/**
 * Every destination the site chrome links to, in one table.
 *
 * One table because the acceptance criterion is *"every footer link resolves; real page or stub,
 * never a 404"* and a criterion checked by clicking is a criterion that rots. `links.test.ts` walks
 * this and asserts each internal path has a route; the e2e suite walks the rendered footer and
 * asserts each one answers 200.
 *
 * **The nav filled in with EPIC-072, and took the mockup's shape in EPIC-016d.** EPIC-016 left it
 * nearly empty and said why: the mockup's Product · Features · Delivery · Pricing · Learn · Docs row
 * named pages that did not exist, and a nav link to a 404 is worse than no nav. Four of those six
 * exist now, and `Product` — which points at the home page and therefore cannot 404 — joined them.
 * **Pricing and Learn still do not** — pricing needs EPIC-070 and there is no plan to sell, lessons
 * are Stage 7 — so they are still absent rather than stubbed, for the same reason as before.
 *
 * **There is still no GitHub link.** `github.com/41prompts/41prompts` is the URL `packages/core`'s
 * manifest and `REUSE.toml` publish, and EPIC-056's report §8 records that the repository has not
 * been created: seven steps need a person and none is ticked. The whole value of that link is
 * arriving at the code, so it goes in the change that makes the code arrive.
 */

export interface SiteLink {
  readonly name: string;
  readonly href: string;
}

export interface SiteLinkGroup {
  readonly heading: string;
  readonly links: readonly SiteLink[];
}

/**
 * Which public page is being rendered, so the nav can mark it `aria-current="page"`.
 *
 * A union rather than a string, and each nav entry carries its own value rather than the nav
 * deriving one from the href: deriving it looked right and was wrong for the home page, whose
 * `current` is `"home"` and whose href is `/`. A value that is silently never equal produces a nav
 * that simply never marks itself, which is the kind of defect nothing fails on.
 */
export type SiteNavCurrent =
  | "home"
  | "features"
  | "delivery"
  | "docs"
  | "security"
  | "changelog"
  | "guides"
  | "decompile";

export interface NavLink extends SiteLink {
  readonly id: SiteNavCurrent;
}

/**
 * The section links, which **collapse below 900px**.
 *
 * `41prompts-full-mockup.html` does exactly this — `.navlinks { display: none }` with
 * `@media (min-width: 900px) { .navlinks { display: flex } }` — and the prototype is the spec for
 * the interface, so this is its decision rather than a new one.
 *
 * It was also the only answer that survived measurement. With all of them inline the nav is
 * **185px wider than a 390px viewport**, and because the nav is on every page that made *every*
 * public page scroll sideways — including `/` and `/legal/privacy`, whose bodies this epic never
 * touched. One defect, seven failing tests, two of them in suites belonging to other epics. Wrapping
 * onto a second row was the alternative and is BUG-069, which was filed for exactly that.
 *
 * Nothing becomes unreachable: the footer carries every one of these at every width.
 */
export const NAV_SECTION_LINKS: readonly NavLink[] = [
  // `Product` points at the home page, so its `id` is `home` — a nav entry's `id` names the page it
  // marks, never the word on it, which is the distinction the type's own comment above was written
  // for.
  { id: "home", name: "Product", href: "/" },
  { id: "features", name: "Features", href: "/features" },
  { id: "delivery", name: "Delivery", href: "/delivery" },
  { id: "docs", name: "Docs", href: "/docs" },
  // **`Decompiler` moved in here in EPIC-016d**, out of a second group that kept it visible at every
  // width. EPIC-072 put it there because EPIC-016's `landing.spec.ts` asserted a 44px `Decompiler`
  // link at 390px and because it is the one page a phone reader can use without an account.
  //
  // What changed is what stands beside it. The nav now carries `Sign in` **and** `Start free`, and
  // five controls plus a logo do not fit on one row at 375px — which is the exact defect
  // (BUG-069) that put `.site-nav-links` behind a 900px breakpoint in the first place. Below that
  // width the mockup's nav is the logo, Theme, Sign in and Start free, and now so is ours.
  //
  // Nothing becomes unreachable: the footer carries `Decompiler` at every width, in the Product
  // group, and the home page's own closing band links to it in a 44px button that the same spec
  // still measures.
  { id: "decompile", name: "Decompiler", href: "/decompile" }
];

/** Everything in the nav, for the tests and the walk. */
export const NAV_LINKS: readonly NavLink[] = NAV_SECTION_LINKS;

/** Pages that exist and do what they say. */
const PRODUCT_LINKS: readonly SiteLink[] = [
  { name: "Features", href: "/features" },
  { name: "Delivery", href: "/delivery" },
  { name: "Decompiler", href: "/decompile" },
  { name: "Changelog", href: "/changelog" },
  { name: "Sign in", href: "/sign-in" }
];

const RESOURCE_LINKS: readonly SiteLink[] = [
  { name: "Docs", href: "/docs" },
  { name: "Guides", href: "/guides" },
  { name: "Security", href: "/security" }
];

const LEGAL_LINKS: readonly SiteLink[] = [
  { name: "Terms", href: "/legal/terms" },
  { name: "Privacy", href: "/legal/privacy" },
  { name: "Security policy", href: "/legal/security" },
  { name: "Sub-processors", href: "/legal/sub-processors" },
  { name: "Third-party notices", href: "/legal/third-party-notices" }
];

const ELSEWHERE_LINKS: readonly SiteLink[] = [{ name: "Contact", href: "/contact" }];

export const FOOTER_GROUPS: readonly SiteLinkGroup[] = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Resources", links: RESOURCE_LINKS },
  { heading: "Legal", links: LEGAL_LINKS },
  { heading: "Elsewhere", links: ELSEWHERE_LINKS }
];

export const ALL_FOOTER_LINKS: readonly SiteLink[] = FOOTER_GROUPS.flatMap((group) => group.links);

/**
 * Every public page, and which of them are deliberately kept out of search.
 *
 * **It is JSON rather than a TypeScript array, and that is the whole point.**
 * `scripts/lighthouse-site.mjs` is plain Node with no transpiler in front of it — the same
 * constraint that put `apps/web/e2e/env.mjs` where it is — so it cannot import a `.ts` file. A
 * second copy of the list inside that script is a decision that lives here and goes stale silently:
 * the page added next month would be missing from it and the run would report a clean pass over a
 * site it had not fully seen. One file, four readers — this module, `app/sitemap.ts`,
 * `routes-agree.test.ts` over `app/robots.ts`, and the Lighthouse script.
 *
 * **`notIndexed` is intent, and it is checked in both directions.** `robots.txt` has disallowed
 * `/contact`, `/sign-in` and `/sign-up` since EPIC-015, because none of the three is a destination
 * for a search result. Lighthouse scores that as an SEO failure — `is-crawlable`, weight 4 of 11 —
 * so those three come in at 63 to 66 and the roadmap's "Lighthouse ≥ 90 all pages" cannot be met on
 * them without indexing pages we deliberately do not index. Naming them here lets the Lighthouse
 * run drop that **one** audit for **these** routes and keep every other SEO audit — and lets
 * `routes-agree.test.ts` fail if a page ever becomes uncrawlable without being named.
 *
 * `/d/[id]` and `/waitlist/unsubscribe` are absent from both: each needs a token in the path and
 * neither is reachable from the chrome.
 */
export const INDEXED_ROUTES: readonly string[] = publicRoutes.indexed;
export const NOT_INDEXED_ROUTES: readonly string[] = publicRoutes.notIndexed;
export const PUBLIC_ROUTES: readonly string[] = [...publicRoutes.indexed, ...publicRoutes.notIndexed];
