/**
 * Every destination the site chrome links to, in one table.
 *
 * One table because the acceptance criterion is *"every footer link resolves; real page or stub,
 * never a 404"* and a criterion checked by clicking is a criterion that rots. `links.test.ts` walks
 * this and asserts each internal path has a route; the e2e suite walks the rendered footer and
 * asserts each one answers 200.
 *
 * **The nav filled in with EPIC-072.** EPIC-016 left it nearly empty and said why: the mockup's
 * Product · Features · Delivery · Pricing · Learn · Docs row named pages that did not exist, and a
 * nav link to a 404 is worse than no nav. Four of those six exist now. **Pricing and Learn still do
 * not** — pricing needs EPIC-070 and there is no plan to sell, lessons are Stage 7 — so they are
 * still absent rather than stubbed, for the same reason as before.
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

/** The nav. Short on purpose: four destinations is the most a reader scans without reading. */
export const NAV_LINKS: readonly NavLink[] = [
  { id: "features", name: "Features", href: "/features" },
  { id: "delivery", name: "Delivery", href: "/delivery" },
  { id: "docs", name: "Docs", href: "/docs" },
  { id: "decompile", name: "Decompiler", href: "/decompile" }
];

/** Pages that exist and do what they say. */
export const PRODUCT_LINKS: readonly SiteLink[] = [
  { name: "Features", href: "/features" },
  { name: "Delivery", href: "/delivery" },
  { name: "Decompiler", href: "/decompile" },
  { name: "Changelog", href: "/changelog" },
  { name: "Sign in", href: "/sign-in" }
];

export const RESOURCE_LINKS: readonly SiteLink[] = [
  { name: "Docs", href: "/docs" },
  { name: "Guides", href: "/guides" },
  { name: "Security", href: "/security" }
];

export const LEGAL_LINKS: readonly SiteLink[] = [
  { name: "Terms", href: "/legal/terms" },
  { name: "Privacy", href: "/legal/privacy" },
  { name: "Security policy", href: "/legal/security" },
  { name: "Sub-processors", href: "/legal/sub-processors" },
  { name: "Third-party notices", href: "/legal/third-party-notices" }
];

export const ELSEWHERE_LINKS: readonly SiteLink[] = [{ name: "Contact", href: "/contact" }];

export const FOOTER_GROUPS: readonly SiteLinkGroup[] = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Resources", links: RESOURCE_LINKS },
  { heading: "Legal", links: LEGAL_LINKS },
  { heading: "Elsewhere", links: ELSEWHERE_LINKS }
];

export const ALL_FOOTER_LINKS: readonly SiteLink[] = FOOTER_GROUPS.flatMap((group) => group.links);

/**
 * Every public page, for the tests that walk them all.
 *
 * `/d/[id]` and `/waitlist/unsubscribe` are deliberately absent: both need a token in the path and
 * neither is reachable from the chrome.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  "/",
  "/features",
  "/delivery",
  "/docs",
  "/security",
  "/changelog",
  "/guides",
  "/guides/what-your-prompt-does-not-check",
  "/decompile",
  "/contact",
  "/sign-in",
  "/sign-up",
  "/legal/terms",
  "/legal/privacy",
  "/legal/security",
  "/legal/sub-processors",
  "/legal/third-party-notices"
];
