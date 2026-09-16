import type { ReactNode } from "react";
import { signOutAction } from "@/lib/account-actions";
import { requireSession } from "@/lib/session";

/**
 * The chrome every signed-in page shares.
 *
 * ## Why a layout and not a widget on the projects page
 *
 * The mockup puts identity and account in **persistent chrome** — a left rail whose foot shows who
 * you are, with an "Account" group above it — not in the content of any one page. A layout is the
 * same shape at a fraction of the cost, and it is where the rail goes when Stage 3 builds it.
 *
 * Putting Sign out on `/app/projects` instead would have contradicted the mockup and left the canvas
 * and prompt pages with no way to sign out, which is the bug this change exists to fix rather than a
 * smaller version of it.
 *
 * ## Why this exists at all
 *
 * Before it, the *only* page carrying Sign out and a link to Account was `/app` — a stub that is now
 * a redirect. Removing that stub without giving those controls a home would have traded one dead end
 * for another: `/app/account` was reachable from exactly one link, on the page being deleted.
 *
 * `requireSession` runs here so every route beneath it is behind auth by construction rather than by
 * each page remembering. The pages still call it for their own redirect-back path; that is cheap and
 * keeps a page's `next` value accurate when someone deep-links into it.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/app/projects");

  return (
    <div className="app-shell">
      <header className="app-chrome">
        <a className="app-chrome-home" href="/app/projects">
          Projects
        </a>
        <div className="app-chrome-spacer" />
        <span className="app-chrome-who">{session.user.email}</span>
        {/* EPIC-042. Provider keys are account-level, so their home is the chrome rather than any
            one prompt. It is `/app/settings/providers` and not `/app/settings`, because Providers is
            the only one of the mockup's five Settings tabs that exists yet and a landing page
            listing one thing would imply four more. */}
        <a className="app-chrome-link" href="/app/settings/providers">
          Settings
        </a>
        <a className="app-chrome-link" href="/app/account">
          Account
        </a>
        <form action={signOutAction}>
          <button className="app-chrome-signout" type="submit">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </div>
  );
}
