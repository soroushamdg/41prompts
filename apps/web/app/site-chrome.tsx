import { LogoMark, ThemeToggle } from "@41prompts/ui";
import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { FOOTER_GROUPS, NAV_SECTION_LINKS, type SiteNavCurrent } from "@/lib/site/links";
import { appOrigin } from "@/lib/site/url";

/**
 * The nav and the footer, shared by every public page.
 *
 * **EPIC-016 left the nav nearly empty and said why**: the mockup's Product · Features · Delivery ·
 * Pricing · Learn · Docs row named pages that did not exist, and a nav link to a 404 is worse than
 * no nav. **EPIC-072 filled in the four that now exist** and left Pricing and Learn out for the
 * original reason: there is still nothing to sell and there are still no lessons.
 * `lib/site/links.ts` holds the table and carries the argument.
 *
 * ## The right-hand controls, EPIC-016d
 *
 * **"Start free" arrives, and that reverses EPIC-016 decision 2** — *"sign up is not promoted, and
 * the only action the home page pushes is the ask bar"*. Soroush's parity instruction of 2026-09-20
 * is newer than that decision and the mockup draws the button; `landing.spec.ts`'s
 * above-the-fold assertion moved with it rather than being deleted, and says so.
 *
 * **It renders only when signed out.** The mockup shows it unconditionally because a prototype has
 * no sessions. Offering "Start free" to somebody who already has an account is an invitation to
 * make a second one, and two primary buttons competing for one person is not what the mockup draws
 * either — so a signed-in reader gets "Go to dashboard" in its place.
 *
 * **Sign in and Go to dashboard are bordered buttons now**, `.btn .btn-sm`, which is what the
 * mockup draws and which is also what stops the primary from standing alone on the row. They are
 * still `<a>` elements: they navigate, so they are links wearing a button's clothes, the same trade
 * the closing band's `.cta-band-link` already makes.
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
          {/* **No `size` here, deliberately.** `LogoMark` writes `size` as an inline `--logo-size`,
              which no stylesheet can answer — so a nav that wants a smaller mark on a phone cannot
              ask for one. Left unset, the length comes from `.site-nav .logo` in `landing.css`,
              which sets it per breakpoint: 17px below 560, 20px above, the size it has always
              rendered at on a laptop. */}
          <LogoMark href="/" />
          <span className="site-nav-spacer" />
          {/* Collapses below 900px, as the mockup's own `.navlinks` does. The footer carries every
            one of them at every width, so nothing becomes unreachable — see `lib/site/links.ts`,
            which has the measurement that settled it and the reason `Decompiler` joined this group
            in EPIC-016d. */}
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
          <ThemeToggle />
          {/* Absolute, and to the other host: `/app` on the apex would only 301 there anyway, and a
            link that visibly goes where it says is worth more than a tidy relative href. */}
          {signedIn ? (
            <a className="btn btn-sm" href={`${appOrigin()}/app`} data-testid="nav-dashboard">
              Go to dashboard
            </a>
          ) : (
            <>
              <a className="btn btn-sm" href={`${appOrigin()}/sign-in`} data-testid="nav-sign-in">
                Sign in
              </a>
              <a className="btn btn-sm btn-pri" href={`${appOrigin()}/sign-up`} data-testid="nav-start-free">
                Start free
              </a>
            </>
          )}
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
            {/* The mockup's, restored in EPIC-016d. EPIC-016 replaced it because the hero had
                dropped "the workbench for the prompt layer" and a category phrase standing alone in
                a footer says nothing about what the product does. The hero carries it again as its
                eyebrow, so the footer's line reads as the second half of a sentence the page has
                already started — and "Made in Montréal" is the part that was never the mockup's
                invention: it is where the servers are, which `/legal/privacy` also says. */}
            <p className="site-foot-blurb">The workbench for the prompt layer. Made in Montréal.</p>
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
