import type { MetadataRoute } from "next";
import { INDEXED_ROUTES } from "@/lib/site/links";
import { siteOrigin } from "@/lib/site/url";

/**
 * Request time, not build time.
 *
 * These are Route Handlers and Next caches them by default, which would bake whatever
 * `BETTER_AUTH_URL` happened to be during `docker build` into the file every environment then
 * serves — localhost, in practice. The origin has to be read where it is correct.
 */
export const dynamic = "force-dynamic";

/**
 * Only real pages (decision 9), and **every** real page.
 *
 * `/sign-in`, `/sign-up` and `/contact` work but are not search destinations; `/d/` is deliberately
 * excluded everywhere. Listing a page here that robots.txt disallows is a contradiction a crawler
 * reports, so the two files are kept in step on purpose.
 *
 * **They are derived rather than listed** — from `lib/site/public-routes.json`'s `indexed`, which
 * `lib/site/links.ts` and `scripts/lighthouse-site.mjs` also read. EPIC-017 had already derived the
 * legal routes from `LEGAL_DOC_SLUGS` for this reason, and EPIC-072 arrived with six more pages and
 * found that a hand-listed sitemap simply does not mention them: they were live, linked from the
 * nav, and invisible to a crawler that starts from the sitemap. `routes-agree.test.ts` now fails
 * when a public page is missing from here.
 *
 * Priority is the one thing still written out, because it is an editorial judgement rather than a
 * fact about the routes. Anything unlisted gets 0.5.
 */
const PRIORITY: Readonly<Record<string, { priority: number; changeFrequency: "weekly" | "monthly" | "yearly" }>> = {
  "/": { priority: 1, changeFrequency: "weekly" },
  "/decompile": { priority: 0.8, changeFrequency: "weekly" },
  "/delivery": { priority: 0.8, changeFrequency: "weekly" },
  "/features": { priority: 0.8, changeFrequency: "weekly" },
  "/docs": { priority: 0.8, changeFrequency: "weekly" },
  // The one content asset (EPIC-015 decision 4). It exists to be found.
  "/guides/what-your-prompt-does-not-check": { priority: 0.7, changeFrequency: "monthly" },
  "/guides": { priority: 0.6, changeFrequency: "monthly" },
  "/security": { priority: 0.6, changeFrequency: "monthly" },
  "/changelog": { priority: 0.5, changeFrequency: "weekly" }
};

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  return INDEXED_ROUTES.map((route) => {
    const entry = PRIORITY[route] ?? { priority: 0.3, changeFrequency: "yearly" as const };
    return {
      url: `${origin}${route === "/" ? "/" : route}`,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority
    };
  });
}
