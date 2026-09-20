import { Pill, ThemeToggle } from "@41prompts/ui";
import type { ReactNode } from "react";
import type { Crumb } from "@/lib/app-shell/crumbs";

/**
 * The mockup's sticky top bar (lines 1072–1080): where you are, what state the prompt is in, and
 * the one action worth having on every screen.
 *
 * ## The version pill says `Draft vN · Live vM`, in neutral ink
 *
 * The mockup draws `v7 ● unsaved` with an amber dot. `docs/design/README.md` corrects both halves
 * and this is the first surface to carry the correction in chrome:
 *
 * > Colour: the prototypes use amber for "unsaved" and for cost deltas. **Amber means drift only.**
 * > Version state: one vocabulary everywhere: "Draft v7" and "Live v6". Not "v7 · unsaved", not
 * > "v7 · current".
 *
 * So there is no dot, no amber, and the words come from `versionName()` and `liveName()` — the two
 * functions that already say this on the pages, rather than a third spelling invented here.
 *
 * ## Why the pill is in the chrome at all
 *
 * Before this, Draft and Live state was visible on the prompt page and nowhere else. It is the
 * thing you most want to know while looking at a run, a diff or the Deploy gate — all three of
 * which are pages that did not show it.
 */

export interface AppTopBarProps {
  readonly crumbs: readonly Crumb[];
  /** `Draft vN`, and `Draft vN · Live vM` once published. Absent when no prompt is in context. */
  readonly versionState?: string;
  /** The mockup's `Run suite`. Present only when a prompt is in context. */
  readonly primaryAction?: { readonly name: string; readonly href: string };
  /** The public site, on its own host. */
  readonly siteHref: string;
  /** The rail, repeated inside a disclosure below 940px. See `layout.tsx`. */
  readonly menu: ReactNode;
}

export function AppTopBar({ crumbs, versionState, primaryAction, siteHref, menu }: AppTopBarProps) {
  return (
    <header className="app-topbar">
      {menu}

      {/* `aria-label`, not a heading: this names where you are, and the page's own `<h1>` is the
          heading. A breadcrumb trail that is also a heading gives a screen reader two titles. */}
      <nav className="app-topbar-crumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((crumb, index) => {
            const last = index === crumbs.length - 1;
            return (
              <li key={`${crumb.name}-${index}`}>
                {crumb.href === undefined || last ? (
                  <span aria-current={last ? "page" : undefined}>{crumb.name}</span>
                ) : (
                  <a href={crumb.href}>{crumb.name}</a>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <span className="app-topbar-spacer" />

      {versionState !== undefined && <Pill>{versionState}</Pill>}

      <ThemeToggle />

      {/* Absolute and to the other host, for the reason `site-chrome.tsx` gives in the other
          direction: a link that visibly goes where it says is worth more than a tidy relative one. */}
      <a className="app-topbar-link" href={siteHref}>
        Website
      </a>

      {primaryAction !== undefined && (
        <a className="btn btn-pri btn-sm app-topbar-action" href={primaryAction.href}>
          {primaryAction.name}
        </a>
      )}
    </header>
  );
}
