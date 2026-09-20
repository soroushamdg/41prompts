import type { RailGroup } from "@/app/app/app-rail";

/**
 * The rail's table, in one place, for the same reason `lib/site/links.ts` holds the site's.
 *
 * The acceptance criterion is *"the correct group present or absent for that route"*, and a
 * criterion checked by clicking is a criterion that rots. This is walked by a test.
 *
 * The mockup draws three groups (lines 1045–1064) and this builds up to four, in its order: the
 * permanent `WORKSPACE`, then the records you are inside — outermost first — then `ACCOUNT` pinned
 * last. The mockup only ever shows one record because it only ever draws one screen; a prompt is
 * inside a project, and the rail says both.
 */

export interface ShellNames {
  /** The project's name, when a project is in context. */
  readonly projectName?: string;
  /** The prompt's name, when a prompt is in context. */
  readonly promptName?: string;
  /** The project a prompt belongs to, so a prompt route still shows the project it is inside. */
  readonly promptProjectId?: string;
}

export interface RailGroupInput extends ShellNames {
  readonly projectId?: string;
  readonly promptId?: string;
  /** The public site's origin: `Import` is the decompiler, which lives there. */
  readonly siteOrigin: string;
}

/**
 * `Import` points at the **public decompiler**, on the apex host.
 *
 * It is the import path that exists. EPIC-025 is written and unscheduled; when it lands, this href
 * becomes `/app/import` and the cross-host jump goes away. Until then the rail names the real thing
 * rather than a route that would 404 — EPIC-016's rule, one host over.
 */
export function railGroups(input: RailGroupInput): readonly RailGroup[] {
  const groups: RailGroup[] = [
    {
      heading: "Workspace",
      links: [
        { id: "projects", name: "Projects", href: "/app/projects" },
        { id: "import", name: "Import", href: `${input.siteOrigin}/decompile` }
      ]
    }
  ];

  // **The project group shows on a prompt route too, and that is the hierarchy, not a convenience.**
  //
  // The first version showed one contextual group — the project's *or* the prompt's — and two
  // browser tests found the two holes that leaves. Connect is project-scoped, so opening it from a
  // prompt swapped the prompt's group away and stranded you; and from a prompt there was no way to
  // the project at all, because the page's own `Project` crumb had moved into a two-deep trail that
  // does not carry it.
  //
  // Both are the same mistake: a prompt *is inside* a project, and a rail that can only say one of
  // those two things at a time has to keep choosing which one to lose.
  const projectId = input.promptProjectId ?? input.projectId;
  if (projectId !== undefined && input.projectName !== undefined) {
    groups.push({
      heading: input.projectName,
      links: [
        { id: "prompts", name: "Prompts", href: `/app/p/${projectId}` },
        { id: "connect", name: "Connect", href: `/app/p/${projectId}/connect` }
      ]
    });
  }

  if (input.promptId !== undefined && input.promptName !== undefined) {
    groups.push({
      heading: input.promptName,
      links: [
        { id: "editor", name: "Blok Editor", href: `/app/pr/${input.promptId}` },
        { id: "runs", name: "Runs", href: `/app/pr/${input.promptId}/runs` },
        { id: "versions", name: "Versions", href: `/app/pr/${input.promptId}/versions` },
        { id: "deploy", name: "Deploy", href: `/app/pr/${input.promptId}/deploy` }
      ]
    });
  }

  groups.push({
    heading: "Account",
    links: [
      // `/app/settings` is not a route: Settings is three sibling pages joined by links (EPIC-055),
      // and Providers is where the rail lands because it is the one a new account needs first.
      { id: "settings", name: "Settings", href: "/app/settings/providers" },
      { id: "account", name: "Account", href: "/app/account" }
    ]
  });

  return groups;
}
