/**
 * Same-origin check for the two cookie-authenticated POSTs (EPIC-051).
 *
 * A `POST` that reads a session cookie and has no origin check is a CSRF hole: any page on the
 * internet can make a browser send it, with the cookie attached, and here that would mean **moving
 * somebody's production prompt to Live**.
 *
 * Better Auth does its own for `/api/auth/*`; these two routes are ours, so the check is ours.
 *
 * ## Absent is refused, not allowed
 *
 * Every browser sends `Origin` on a cross-site POST, and every modern one sends it on a same-site
 * POST too. A request without one is a program — `curl`, a script, an SDK — and a program is not
 * the caller these two routes have. The session-cookie endpoints are for the Deploy page; `/v1` with
 * a key is the door for programs, and it has no cookie to steal.
 */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return false;

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  // Compared against the URL this request arrived on rather than a configured base, so the check is
  // correct under every host the app answers on — localhost, the built app on a port, staging, the
  // apex — without a fourth copy of "what is our URL" to keep in step.
  return requestOrigin === new URL(request.url).origin;
}
