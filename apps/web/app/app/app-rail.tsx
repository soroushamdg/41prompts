import { LogoMark } from "@41prompts/ui";
import type { ReactNode } from "react";
import type { RailItemId } from "@/lib/app-shell/context";
import { RailIcon } from "./rail-icons";

/**
 * The mockup's left rail (lines 1043–1070): three groups, two of them contextual, over a foot that
 * shows who you are.
 *
 * **Pure.** Everything it renders is a prop, so its group set is unit-testable in all four states —
 * no context, a project, a prompt, and settings — without a request or a database. The group set is
 * the one thing in this epic a screenshot cannot prove.
 *
 * ## Links, not buttons
 *
 * The mockup uses `<button data-app="runs">` because it is a single-file prototype with a JavaScript
 * router. Every one of these navigates, and EPIC-055 already settled the general case for this
 * codebase: *a control that changes the URL is a link*. So each is an `<a>` with
 * `aria-current="page"` — not the mockup's `aria-current="true"`, which is not a valid value on a
 * link.
 *
 * ## What is not here, and why
 *
 * **Lessons.** The mockup puts it in the `ACCOUNT` group. Stage 7 owns the lesson engine and
 * nothing renders at `/app/lessons`; EPIC-016 refused a site nav link to a page that does not exist
 * and the reasoning is identical one host over.
 *
 * **A plan and a quota.** The mockup's foot reads `Pro · 4,120 runs left`. There are no plans until
 * EPIC-070 and no run budget is enforced anywhere, so the foot carries the email and nothing else.
 */

export interface RailLink {
  readonly id: RailItemId;
  readonly name: string;
  readonly href: string;
}

export interface RailGroup {
  /** The uppercase caption above the group. A record's name where the group is contextual. */
  readonly heading: string;
  readonly links: readonly RailLink[];
}

export interface AppRailProps {
  readonly groups: readonly RailGroup[];
  readonly current?: RailItemId;
  readonly email: string;
  /** Rendered into the rail foot. A form, because signing out is a state change, not a GET. */
  readonly signOut: ReactNode;
  /** Where the logo goes: the public site, on its own host. */
  readonly siteHref: string;
  /**
   * The copy inside the mobile disclosure, which drops the logo and the email.
   *
   * **Not a style choice — it is what keeps one email in the document.** The shell renders the rail
   * twice, once per breakpoint, and hides one with `display: none`. That is correct for assistive
   * technology, which reads the accessibility tree and therefore sees exactly one. It is *not*
   * correct for a plain text search: four `auth.spec.ts` assertions written long before this epic
   * do `getByText(email)`, and two matches is a strict-mode violation rather than a passing test.
   *
   * Dropping the email here means the address appears once in the document at any width. The logo
   * goes for a plainer reason: the top bar it drops out of is two inches above it.
   */
  readonly compact?: boolean;
}

/**
 * Initials for the foot's 26px plate.
 *
 * From the email, because that is the only identity this product collects — sign-in is a magic link
 * and nothing asks for a name. One letter, upper-cased, from the local part; a local part that
 * begins with something that is not a letter falls back to a neutral mark rather than rendering a
 * digit or a dot as though it were a name.
 */
export function initialsFor(email: string): string {
  const first = email.trim().charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "·";
}

export function AppRail({ groups, current, email, signOut, siteHref, compact }: AppRailProps) {
  return (
    <nav className="app-rail" aria-label="Workspace">
      {compact !== true && <LogoMark href={siteHref} size="19px" />}

      {groups.map((group) => (
        <div key={group.heading} className="app-rail-group">
          {/* A contextual heading is a record's name, typed by whoever made it. React escapes it;
              it is never markup and never a link. */}
          <p className="app-rail-groupname">{group.heading}</p>
          {group.links.map((link) => (
            <a
              key={link.id}
              className="app-rail-link"
              href={link.href}
              aria-current={link.id === current ? "page" : undefined}
            >
              <RailIcon id={link.id} />
              <span>{link.name}</span>
            </a>
          ))}
        </div>
      ))}

      <div className="app-rail-foot">
        {compact !== true && (
          <div className="app-rail-who">
            <span className="app-rail-avatar" aria-hidden="true">
              {initialsFor(email)}
            </span>
            {/* The email is the only elastic thing in the row and ellipsises, which is the shape
                `.app-chrome-who` arrived at through BUG-069 and is worth keeping. */}
            <span className="app-rail-email" title={email}>
              {email}
            </span>
          </div>
        )}
        {signOut}
      </div>
    </nav>
  );
}
