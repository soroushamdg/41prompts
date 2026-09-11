import { LogoMark, ThemeToggle } from "@41prompts/ui";
import { FOOTER_GROUPS } from "@/lib/site/links";

/**
 * The nav and the footer, shared by every public page.
 *
 * **The nav is nearly empty on purpose** (decision 2). The mockup's Product · Features · Delivery ·
 * Pricing · Learn · Docs row and its "Start free" button are both gone: those pages are EPIC-072 and
 * there is nothing to start. Sign in is a small link, sign up is not promoted at all, and the only
 * action the page pushes is the ask bar.
 */
export function SiteNav({ current }: { current?: "home" | "decompile" }) {
  return (
    <nav className="site-nav" aria-label="Main">
      <div className="site-nav-inner">
        <LogoMark href="/" size="20px" />
        <span className="site-nav-spacer" />
        <a className="site-nav-link" href="/decompile" aria-current={current === "decompile" ? "page" : undefined}>
          Decompiler
        </a>
        <a className="site-nav-link" href="/sign-in">
          Sign in
        </a>
        <ThemeToggle />
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="site-foot">
      <div className="site-wrap">
        <div className="site-foot-grid">
          <div>
            <LogoMark href="/" size="18px" />
            <p className="site-foot-blurb">The workbench for the prompt layer.</p>
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
