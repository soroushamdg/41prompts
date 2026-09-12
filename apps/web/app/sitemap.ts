import type { MetadataRoute } from "next";
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
 * Only real pages (decision 9), which today is two of them.
 *
 * The legal routes are placeholders and are `noindex`; `/sign-in` and `/sign-up` work but are not
 * search destinations; `/d/` is deliberately excluded everywhere. Listing a page here that robots.txt
 * disallows is a contradiction a crawler reports, so the two files are kept in step on purpose.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/decompile`, changeFrequency: "weekly", priority: 0.8 },
    // The one content asset (EPIC-015 decision 4). It exists to be found, so it is the one page here
    // whose whole purpose is the sitemap.
    { url: `${origin}/guides/what-your-prompt-does-not-check`, changeFrequency: "monthly", priority: 0.7 }
  ];
}
