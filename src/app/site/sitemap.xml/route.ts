import { siteUrl } from "@/lib/hosts";

/* 41prompts.ai/sitemap.xml (the proxy maps it here): the public site pages. */
export const dynamic = "force-static";

const PAGES = [
  { path: "/", priority: "1.0" },
  { path: "/terms", priority: "0.3" },
  { path: "/privacy", priority: "0.3" },
];

export function GET() {
  const urls = PAGES.map((p) => `  <url><loc>${siteUrl(p.path)}</loc><priority>${p.priority}</priority></url>`).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
