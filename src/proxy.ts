import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { APP_HINT_COOKIE, APP_URL, SITE_URL, sharedCookieDomain, treeForHost } from "@/lib/hosts";

/** App pages anyone can open. Everything else on the app host needs a session. */
const PUBLIC_APP_PATHS = ["/sign-in", "/sign-in/verify", "/goodbye", "/kit", "/robots.txt"];

export function isPublicAppPath(pathname: string): boolean {
  return PUBLIC_APP_PATHS.includes(pathname);
}

/* Maintenance mode shows one page on both hosts. It is on by default in a
   Vercel production deployment, so pushes to main never expose unfinished
   work; set MAINTENANCE_MODE=0 to launch. MAINTENANCE_MODE=1 forces it on
   anywhere (for checking the page locally). */
export function maintenanceOn(env: Record<string, string | undefined> = process.env): boolean {
  const v = env.MAINTENANCE_MODE;
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return env.VERCEL_ENV === "production";
}

/* Routes each request to the tree for its host: app.41prompts.ai → /app/*,
   everything else → /site/*. Hitting an internal tree directly from the wrong
   host lands in the other tree's catch-all and 404s. Authorization is never
   decided here; pages, route handlers and server actions check the session. */
export function proxy(request: NextRequest) {
  const url = request.nextUrl.clone();
  if (maintenanceOn()) {
    url.pathname = "/maintenance";
    return NextResponse.rewrite(url);
  }
  const tree = treeForHost(request.headers.get("host"));
  const signedIn = tree === "app" && Boolean(getSessionCookie(request));
  // Optimistic only: no session cookie means sign in first. Pages and
  // handlers still check the session itself.
  if (tree === "app" && !isPublicAppPath(url.pathname) && !signedIn) {
    const signIn = new URL("/sign-in", request.url);
    if (url.pathname !== "/") signIn.searchParams.set("next", url.pathname + url.search);
    return syncAppHint(request, NextResponse.redirect(signIn), false);
  }
  url.pathname = `/${tree}${url.pathname === "/" ? "" : url.pathname}`;
  const res = NextResponse.rewrite(url);
  if (tree !== "app") return res;
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return syncAppHint(request, res, signedIn);
}

const HINT_DOMAIN = sharedCookieDomain(APP_URL, SITE_URL);

/** Keeps the landing page's "signed in" hint in step with the session cookie. */
export function syncAppHint(request: NextRequest, res: NextResponse, signedIn: boolean): NextResponse {
  const hinted = request.cookies.get(APP_HINT_COOKIE)?.value === "1";
  if (signedIn === hinted) return res;
  res.cookies.set(APP_HINT_COOKIE, signedIn ? "1" : "", {
    ...(HINT_DOMAIN ? { domain: HINT_DOMAIN } : {}),
    path: "/",
    sameSite: "lax",
    secure: APP_URL.startsWith("https://"),
    maxAge: signedIn ? 60 * 60 * 24 * 30 : 0,
  });
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/|ingest/|monitoring|assets/|favicon\\.svg|favicon\\.ico).*)"],
};
