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
 * Decision 9, exactly: allow `/` and `/decompile`, disallow `/d/`.
 *
 * `/d/` is somebody else's shared prompt. Those pages already carry `noindex` in a meta tag and in
 * the `X-Robots-Tag` header (EPIC-014), and this is the third and cheapest layer: a crawler that
 * honours robots.txt never fetches one at all.
 *
 * Everything else — `/sign-in`, `/app`, the legal placeholders — is disallowed because none of it is
 * a destination for a search result today, and a placeholder indexed as "41Prompts privacy" is worse
 * than nothing on file.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/decompile", "/guides/", "/llms.txt"],
        disallow: ["/d/", "/app", "/api/", "/sign-in", "/sign-up", "/legal/", "/contact", "/dev/", "/waitlist/"]
      }
    ],
    sitemap: `${await siteOrigin()}/sitemap.xml`
  };
}
