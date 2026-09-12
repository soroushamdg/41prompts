import { LogoMark, ThemeToggle } from "@41prompts/ui";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { FOOTER_GROUPS } from "@/lib/site/links";
import { appOrigin } from "@/lib/site/url";

/**
 * The nav and the footer, shared by every public page.
 *
 * **The nav is nearly empty on purpose** (decision 2). The mockup's Product · Features · Delivery ·
 * Pricing · Learn · Docs row and its "Start free" button are both gone: those pages are EPIC-072 and
 * there is nothing to start. Sign in is a small link, sign up is not promoted at all, and the only
 * action the page pushes is the ask bar.
 */
/**
 * Whether this visitor is signed in, read on the server.
 *
 * **Not in an effect**, which is the whole reason the session cookie is now scoped to the parent
 * domain. An effect would render "Sign in" first and swap it for "Go to dashboard" after hydration —
 * a flash of the wrong answer on every page load for exactly the people who already have an account.
 *
 * Returns `false` rather than throwing if the session lookup fails. The nav is not a security
 * boundary: `/app/*` is gated by `requireSession` and by the proxy, and a marketing page that
 * 500s because a database was briefly slow would be a worse trade than one that says "Sign in".
 */
async function hasSession(): Promise<boolean> {
  try {
    return (await getAuth().api.getSession({ headers: await headers() })) !== null;
  } catch {
    return false;
  }
}

export interface SiteNavProps {
  readonly current?: "home" | "decompile";
  /** Whether to offer the dashboard or sign-in. Passed in, so this component stays pure. */
  readonly signedIn: boolean;
}

/**
 * The nav itself: no data fetching, so it renders in a unit test in both states without a database,
 * a request or a mock. `SiteNavWithSession` below is the one pages use.
 */
export function SiteNav({ current, signedIn }: SiteNavProps) {
  return (
    <nav className="site-nav" aria-label="Main">
      <div className="site-nav-inner">
        <LogoMark href="/" size="20px" />
        <span className="site-nav-spacer" />
        <a className="site-nav-link" href="/decompile" aria-current={current === "decompile" ? "page" : undefined}>
          Decompiler
        </a>
        {/* Absolute, and to the other host: `/app` on the apex would only 301 there anyway, and a
            link that visibly goes where it says is worth more than a tidy relative href. */}
        {signedIn ? (
          <a className="site-nav-link" href={`${appOrigin()}/app`} data-testid="nav-dashboard">
            Go to dashboard
          </a>
        ) : (
          <a className="site-nav-link" href={`${appOrigin()}/sign-in`} data-testid="nav-sign-in">
            Sign in
          </a>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}

/** What every page renders. Reads the session on the server and hands it to the pure component. */
export async function SiteNavWithSession({ current }: { current?: "home" | "decompile" }) {
  return <SiteNav current={current} signedIn={await hasSession()} />;
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot-grid">
          <div>
            <LogoMark href="/" size="18px" />
            {/* Not a category phrase. The hero dropped "the workbench for the prompt layer" and it survived
                here, where it was the footer's only sentence and said nothing about what the product
                does. */}
            <p className="site-foot-blurb">Paste a prompt. See what nothing checks.</p>
          </div>
          {FOOTER_GROUPS.map((group) => (
            <div key={group.heading}>
              <h2>{group.heading}</h2>
              {group.links.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.name}
                </a>
              ))}
            </div>
          ))}
        </div>
        {/* No copyright line. `CLAUDE.md` keeps the holder as `<legal entity>` until incorporation,
            and a © naming a company that does not exist yet is exactly the kind of claim decision 4
            rules out. EPIC-017 adds it with the rest of the legal text. */}
      </div>
    </footer>
  );
}
