/* The two hosts. 41prompts.ai serves the landing page; app.41prompts.ai serves
   the app. Locally the app is plain localhost (Google OAuth refuses *.localhost
   redirect URIs) and the site is site.localhost. */

function trim(url: string) {
  return url.replace(/\/+$/, "");
}

export const APP_URL = trim(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3141");
export const SITE_URL = trim(process.env.NEXT_PUBLIC_SITE_URL || "http://site.localhost:3141");
export const APP_HOST = new URL(APP_URL).host.toLowerCase();

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
