import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

export const config = {
  matcher: ["/app/:path*"],
};

// Optimistic check only: confirms a session cookie is present, without a database round trip
// on every request to a matched path. The authoritative check — is the session actually still
// valid, has the user been soft-deleted since — happens in the page itself via
// `auth.api.getSession` (lib/session.ts). Next.js's own docs warn that a Server Action's route
// can end up outside whatever a proxy matcher covers after a refactor, so that page-level check
// is the one this app actually depends on; this gate only saves the DB round trip for requests
// that were never going to have a session anyway.
export function proxy(request: NextRequest) {
  const sessionCookie = getSessionCookie(request, { cookiePrefix: "41prompts" });
  if (sessionCookie) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(signInUrl);
}
