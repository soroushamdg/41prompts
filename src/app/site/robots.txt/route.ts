import { siteUrl } from "@/lib/hosts";

/* 41prompts.ai/robots.txt (the proxy maps it here). Everything on the site
   host may be crawled; the app host marks itself noindex. */
export const dynamic = "force-static";

export function GET() {
  const body = ["User-agent: *", "Allow: /", "", `Sitemap: ${siteUrl("/sitemap.xml")}`, ""].join("\n");
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
