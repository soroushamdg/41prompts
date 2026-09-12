import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { sessionCookiePrefix } from "@/lib/site/cookie-prefix";
import { redirectTarget } from "@/lib/site/hosts";

export const config = {
  // Everything except Next's own assets and the image optimiser: the host split has to see a
  // request for any page to send it to the right host, where the session gate only cares about
  // `/app/*`. Excluding the asset paths here rather than in the handler keeps the proxy off the
  // hot path for every chunk the browser fetches.
  matcher: ["/((?!_next/static|_next/image).*)"],
};

/**
 * Two jobs, in this order: put the request on the right host, then gate `/app/*`.
 *
 * **The host split first**, because a `/app` request arriving on the apex should be moved to `app.`
 * rather than bounced to a sign-in page on the wrong host — and because a marketing page on `app.`
 * must leave before anything else looks at it.
 *
 * The rule itself is `lib/site/hosts.ts`, which the redirects, `robots.ts` and the tests all read
 * from. 301 rather than 302 so search engines settle on one host per page instead of keeping both.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const target = redirectTarget(request.headers.get("host") ?? "", pathname, search);
  if (target !== undefined) {
    return NextResponse.redirect(target, 301);
  }

  if (!pathname.startsWith("/app")) {
    return NextResponse.next();
  }

  // Optimistic check only: confirms a session cookie is present, without a database round trip
  // on every request to a matched path. The authoritative check — is the session actually still
  // valid, has the user been soft-deleted since — happens in the page itself via
  // `auth.api.getSession` (lib/session.ts). Next.js's own docs warn that a Server Action's route
  // can end up outside whatever a proxy matcher covers after a refactor, so that page-level check
  // is the one this app actually depends on; this gate only saves the DB round trip for requests
  // that were never going to have a session anyway.
  const sessionCookie = getSessionCookie(request, { cookiePrefix: sessionCookiePrefix() });
  if (sessionCookie) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}
