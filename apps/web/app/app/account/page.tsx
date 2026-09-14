import type { Metadata } from "next";
import { signOutAction } from "@/lib/account-actions";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Account — 41Prompts", robots: { index: false, follow: false } };

/**
 * The account page: who you are, how to leave, how to go.
 *
 * **Deliberately the smallest honest version, and deliberately not a designed screen.** There is no
 * account screen in `docs/design/`, so inventing one would be inventing product. What this fixes is
 * BUG-002: the page was a bare `<main>` with no container class while its sibling `/app/projects`
 * used `app-page`, so its body rendered flush against the left edge of the viewport. It is the same
 * class of defect as the `/app` stub that caused the 2026-09-13 incident, on a route reachable from
 * the chrome on every signed-in page.
 *
 * It now uses exactly the container and heading its sibling uses, and the list treatment the
 * projects list uses — which already carries the 44px touch target rule 12 asks for. Nothing here is
 * new design; it is the existing vocabulary applied to a page that had been missed.
 */
export default async function AccountPage() {
  const session = await requireSession("/app/account");

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <h1>Account</h1>
      </header>

      <p className="app-state">Signed in as</p>
      <p className="app-account-email">{session.user.email}</p>

      <ul className="app-list">
        <li>
          <form action={signOutAction}>
            {/* A form submit, not a link: signing out is a state change and must not be a GET
                something can prefetch. Styled as the list's other rows so it reads as one set. */}
            <button className="app-list-action" type="submit">
              Sign out
            </button>
          </form>
        </li>
        <li>
          <a href="/app/account/delete">Delete account</a>
        </li>
        <li>
          <a href="/app/projects">Back</a>
        </li>
      </ul>
    </main>
  );
}
