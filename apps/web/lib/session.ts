import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { safeNextPath } from "./next-url";

// The authoritative check behind proxy.ts's optimistic cookie-presence gate. A request that
// clears the cookie check but has no real session — expired,
// signed out elsewhere, or the account was deleted after the cookie was issued — lands here
// and is bounced back to `/sign-in` with a `next` that returns it to where it was going.
export async function requireSession(currentPath: string) {
  // headers() first, on its own line: it's the dynamic-API call that tells Next.js this route
  // can't be statically prerendered, and it has to run — and be awaited — before getAuth()
  // gets any chance to construct the real client and throw on a build container that has no
  // DATABASE_URL. Evaluating both as one expression let JS's left-to-right argument evaluation
  // call getAuth() first, which broke prerendering for every page under requireSession.
  const requestHeaders = await headers();
  const session = await getAuth().api.getSession({ headers: requestHeaders });
  if (!session) {
    redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(currentPath))}`);
  }
  return session;
}
