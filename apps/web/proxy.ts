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
 * The header the app shell reads its route context from (EPIC-023).
 *
 * **A Next.js layout is given the params of its own segment and no deeper.** `app/app/layout.tsx`
 * sits at `/app`, so it never sees `[projectId]` or `[promptId]` — and the rail's middle group is
 * headed with that record's name. This proxy already parses `pathname` on every `/app/*` request,
 * so forwarding it is three lines here and removes the alternative, which was a second rail in a
 * nested layout nested inside the first one.
 *
 * It is set **only** on `/app/*` and only once a session cookie is present. Nothing public reads
 * it, and a client that sends its own `x-41p-path` has it overwritten rather than trusted.
 */
export const APP_PATH_HEADER = "x-41p-path";

function withPath(request: NextRequest, pathname: string): Headers {
  const headers = new Headers(request.headers);
  headers.set(APP_PATH_HEADER, pathname);
  return headers;
}

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

  // `/app` is not a page; it is a redirect to `/app/projects` (see `app/app/page.tsx`). Doing it
  // here as well as in the page matters for the **signed-out** case: the gate below builds the
  // sign-in `next` value from the path it was given, so without this a signed-out visitor to `/app`
  // is sent to `/sign-in?next=%2Fapp`, signs in, and lands back on a redirect — which works, but
  // puts the dead end's name in a URL people bookmark and share. Redirecting before the gate means
  // the `next` they get is the page they will actually use.
  if (pathname === "/app") {
    return NextResponse.redirect(new URL(`/app/projects${search}`, request.url));
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
    return NextResponse.next({ request: { headers: withPath(request, pathname) } });
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}
