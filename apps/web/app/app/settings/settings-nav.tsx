/**
 * The Settings navigation (EPIC-055 ruling 1).
 *
 * ## Why this is a `nav` and not a tablist
 *
 * `docs/design/README.md` lists "real ARIA tabs" among the things the prototypes get wrong and the
 * build owes, and the mockup draws Settings as five tabs. That correction is about the places where
 * a tab **is** a tab — `Pivots` on the run page, the workbench — where one page holds several panels
 * and a button swaps them without leaving. `packages/ui`'s `Tabs` is that pattern and it is used
 * three times.
 *
 * These are pages. Each does its own query, each is worth sending somebody a link to, and each
 * should survive a reload on the one you were reading. **A control that changes the URL is a link**,
 * and `role="tab"` on a link promises a screen-reader user that a panel is about to swap when a
 * navigation is about to happen — which is a worse answer than the plain one.
 *
 * So: `nav`, links, `aria-current="page"`. It looks like the mockup's tabs; it does not lie about
 * what it is. `apps/web/e2e/settings-nav.spec.ts` asserts the absence of `role="tab"` with a control
 * proving the probe can find the role when it is there.
 *
 * ## Three, not five
 *
 * Team and Billing are Stage 6 (EPIC-070). A navigation naming screens that do not exist is the
 * same defect as an empty apps-resolving table: it makes a claim about the product.
 */

export type SettingsSection = "providers" | "keys" | "publishing";

const SECTIONS: readonly { section: SettingsSection; href: string; text: string }[] = [
  { section: "providers", href: "/app/settings/providers", text: "Providers" },
  { section: "keys", href: "/app/settings/keys", text: "API keys" },
  { section: "publishing", href: "/app/settings/publishing", text: "Publishing" },
];

export function SettingsNav({ current }: { current: SettingsSection }) {
  return (
    <nav className="settings-nav" aria-label="Settings">
      <ul>
        {SECTIONS.map((entry) => (
          <li key={entry.section}>
            <a
              href={entry.href}
              className="settings-nav-link"
              aria-current={entry.section === current ? "page" : undefined}
            >
              {entry.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
