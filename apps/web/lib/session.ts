import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { safeNextPath } from "./next-url";

// The authoritative check behind proxy.ts's optimistic cookie-presence gate. A request that
// clears the cookie check but has no real session — expired,
// signed out elsewhere, or the account was deleted after the cookie was issued — lands here
// and is bounced back to `/sign-in` with a `next` that returns it to where it was going.
export async function requireSession(currentPath: string) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect(`/sign-in?next=${encodeURIComponent(safeNextPath(currentPath))}`);
  }
  return session;
}
