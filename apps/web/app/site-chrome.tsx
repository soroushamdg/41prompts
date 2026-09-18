import { LogoMark, ThemeToggle } from "@41prompts/ui";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import {
  FOOTER_GROUPS,
  NAV_ALWAYS_LINKS,
  NAV_SECTION_LINKS,
  type SiteNavCurrent
} from "@/lib/site/links";
import { appOrigin } from "@/lib/site/url";

/**
 * The nav and the footer, shared by every public page.
 *
 * **EPIC-016 left the nav nearly empty and said why**: the mockup's Product · Features · Delivery ·
 * Pricing · Learn · Docs row named pages that did not exist, and a nav link to a 404 is worse than
 * no nav. **EPIC-072 fills in the four that now exist** — Features, Delivery, Docs, Decompiler — and
 * leaves Pricing and Learn out for the original reason: there is still nothing to sell and there are
 * still no lessons. `lib/site/links.ts` holds the table and carries the argument.
 *
 * The "Start free" button stays gone. Sign in is a small link, sign up is not promoted, and the only
 * action the home page pushes is the ask bar.
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
  readonly current?: SiteNavCurrent;
  /** Whether to offer the dashboard or sign-in. Passed in, so this component stays pure. */
  readonly signedIn: boolean;
}

/**
 * The nav itself: no data fetching, so it renders in a unit test in both states without a database,
 * a request or a mock. `SiteNavWithSession` below is the one pages use.
 */
export function SiteNav({ current, signedIn }: SiteNavProps) {
  return (
    <>
      {/* **The skip link belongs to the chrome, not to each page** (EPIC-072). It used to be
          rendered by whichever page remembered it, which meant `/` and the one guide had one and
          `/decompile`, `/contact` and all four legal pages did not — a keyboard reader tabbing into
          any of those walked the whole nav first. Nothing asserted it, because the assertion lived
          on the home page's own test. It is here now, so a page cannot be built without it.
          `/sign-in` and `/sign-up` render no nav and correctly still have none: a skip link with
          nothing to skip is a focusable element that does nothing. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="site-nav" aria-label="Main">
        <div className="site-nav-inner">
          <LogoMark href="/" size="20px" />
          <span className="site-nav-spacer" />
          {/* Collapses below 900px, as the mockup's own `.navlinks` does. The footer carries all
            three at every width, so nothing becomes unreachable — see `lib/site/links.ts`, which has
            the measurement that settled it. */}
          <span className="site-nav-links">
            {NAV_SECTION_LINKS.map((link) => (
              <a
                key={link.href}
                className="site-nav-link"
                href={link.href}
                aria-current={link.id === current ? "page" : undefined}
              >
                {link.name}
              </a>
            ))}
          </span>
          {NAV_ALWAYS_LINKS.map((link) => (
            <a
              key={link.href}
              className="site-nav-link"
              href={link.href}
              aria-current={link.id === current ? "page" : undefined}
            >
              {link.name}
            </a>
          ))}
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
    </>
  );
}

/** What every page renders. Reads the session on the server and hands it to the pure component. */
export async function SiteNavWithSession({ current }: { current?: SiteNavCurrent }) {
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
        {/* The mockup draws `© 2026 41Prompts`; this names the company, which is the whole of
            EPIC-056. It was held back through EPIC-016 and EPIC-017 because a © naming a company
            that did not exist is the kind of claim `docs/design/README.md` decision 4 rules out.
            It exists as of 2026-09-18, so the line arrives. `.site-foot-legal` has been in
            `packages/ui/src/landing.css` since EPIC-016, unused, waiting for exactly this. */}
        <p className="site-foot-legal">© 2026 41Prompts Inc.</p>
      </div>
    </footer>
  );
}
