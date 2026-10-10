import { Logo } from "@/components/logo";
import { cx } from "@/lib/cx";
import { HeaderCta } from "./app-cta";
import { MobileNav, type NavLink } from "./mobile-nav";
import s from "../landing.module.css";

/** The landing page's in-page sections. `base` is "" on the landing page and
    "/" elsewhere on the site, so the links lead back to it. */
export function siteNavLinks(pricing: boolean, base = ""): NavLink[] {
  return [
    { href: `${base}#how`, label: "How it works" },
    { href: `${base}#free`, label: "Free plan" },
    { href: `${base}#performance`, label: "Performance" },
    ...(pricing ? [{ href: `${base}#pricing`, label: "Pricing" }] : []),
    { href: `${base}#faq`, label: "FAQ" },
  ];
}

export function SiteHeader({ pricing, base = "" }: { pricing: boolean; base?: string }) {
  const links = siteNavLinks(pricing, base);
  return (
    <header className={s.siteHead} id="top">
      <div className={cx(s.wrap, s.siteHeadIn)}>
        <Logo href="/" label="41prompts, home" />
        <nav className={s.siteNav} aria-label="Main">
          {links.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
        </nav>
        <div className={s.siteHeadCta}>
          <HeaderCta />
          <MobileNav links={links} />
        </div>
      </div>
    </header>
  );
}
