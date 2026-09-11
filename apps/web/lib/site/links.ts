/**
 * Every destination the site chrome links to, in one table.
 *
 * One table because the acceptance criterion is *"every footer link resolves; real page or stub,
 * never a 404"* and a criterion checked by clicking is a criterion that rots. `site-links.test.ts`
 * walks this and asserts each internal path has a route; the e2e suite walks the rendered footer and
 * asserts each one answers 200.
 *
 * **There is no GitHub link.** Decision 6 asks for one, and it is deliberately absent: the public
 * repository does not exist yet (`github.com/41prompts/41prompts` — the URL `packages/core`'s
 * `package.json` and `REUSE.toml` already publish — answers 404 today). A "GitHub" entry pointing at
 * a stub would be worse than none, because the entire value of that link is arriving at the code.
 * EPIC-015 publishes the mirror; the link belongs in the same change.
 */

export interface SiteLink {
  readonly name: string;
  readonly href: string;
}

export interface SiteLinkGroup {
  readonly heading: string;
  readonly links: readonly SiteLink[];
}

/** Pages that exist and do what they say. */
export const PRODUCT_LINKS: readonly SiteLink[] = [
  { name: "Decompiler", href: "/decompile" },
  { name: "Sign in", href: "/sign-in" }
];

/**
 * Stubs until EPIC-017 writes the real text. Every one resolves to a page that says plainly it is
 * not written yet — the failure decision 6 rules out is a 404, not an honest placeholder.
 */
export const LEGAL_LINKS: readonly SiteLink[] = [
  { name: "Terms", href: "/legal/terms" },
  { name: "Privacy", href: "/legal/privacy" },
  { name: "Security", href: "/legal/security" },
  { name: "Sub-processors", href: "/legal/sub-processors" }
];

export const ELSEWHERE_LINKS: readonly SiteLink[] = [{ name: "Contact", href: "/contact" }];

export const FOOTER_GROUPS: readonly SiteLinkGroup[] = [
  { heading: "Product", links: PRODUCT_LINKS },
  { heading: "Legal", links: LEGAL_LINKS },
  { heading: "Elsewhere", links: ELSEWHERE_LINKS }
];

export const ALL_FOOTER_LINKS: readonly SiteLink[] = FOOTER_GROUPS.flatMap((group) => group.links);
