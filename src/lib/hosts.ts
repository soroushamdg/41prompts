/* The two hosts. 41prompts.ai serves the landing page; app.41prompts.ai serves
   the app. Locally the app is plain localhost (Google OAuth refuses *.localhost
   redirect URIs) and the site is site.localhost. */

/** Trims the trailing slash. Real domains are always served over https (Vercel
    redirects http), so an http:// URL for one is upgraded: otherwise sign-in
    trusts the wrong origin and refuses every request from the browser. */
export function normalizeUrl(url: string) {
  const u = url.trim().replace(/\/+$/, "");
  const host = u.replace(/^https?:\/\//, "").split(/[/:]/)[0] ?? "";
  const local = host === "localhost" || host.endsWith(".localhost") || /^127\./.test(host);
  return !local && u.startsWith("http://") ? `https://${u.slice("http://".length)}` : u;
}

export const APP_URL = normalizeUrl(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3141");
export const SITE_URL = normalizeUrl(process.env.NEXT_PUBLIC_SITE_URL || "http://site.localhost:3141");
export const APP_HOST = new URL(APP_URL).host.toLowerCase();

/** The parent domain both hosts share (app.41prompts.ai + 41prompts.ai →
    41prompts.ai), or null when they share none worth a cookie (localhost and
    site.localhost, where a bare "localhost" domain is refused). */
export function sharedCookieDomain(appUrl: string, siteUrl: string): string | null {
  const labels = (u: string) => new URL(u).hostname.toLowerCase().split(".").reverse();
  const [a, b] = [labels(appUrl), labels(siteUrl)];
  const common: string[] = [];
  for (let i = 0; i < Math.min(a.length, b.length) && a[i] === b[i]; i++) common.push(a[i]!);
  return common.length >= 2 ? common.reverse().join(".") : null;
}

/* "This browser is signed in to the app": a hint the landing page reads to
   swap Sign in and Start free for Go to app. It carries no identity and
   proves nothing; the app still checks the real session on every request. */
export const APP_HINT_COOKIE = "41p_app";

export type HostTree = "app" | "site";

/** Which internal tree serves a request with this Host header. Unknown hosts,
    including Vercel preview URLs, get the landing page. */
export function treeForHost(host: string | null | undefined): HostTree {
  return host && host.toLowerCase() === APP_HOST ? "app" : "site";
}

export function appUrl(path = "/") {
  return APP_URL + (path.startsWith("/") ? path : `/${path}`);
}

export function siteUrl(path = "/") {
  return SITE_URL + (path.startsWith("/") ? path : `/${path}`);
}
