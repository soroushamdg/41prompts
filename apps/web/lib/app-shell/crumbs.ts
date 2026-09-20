import type { AppRouteContext } from "./context";
import type { ShellNames } from "./groups";

/**
 * The breadcrumb trail, derived from the route context and the names already read for the rail.
 *
 * The mockup's trail is two deep — `Refund classifier / **Blok Editor**` — and the last segment is
 * bold and not a link. It does **not** include the project on a prompt route, and this follows it:
 * a prompt's project is one click away in the rail, and a three-deep trail in a bar that also holds
 * a pill, a theme toggle and two actions is what put EPIC-072's nav 185px past a 390px viewport.
 */
export interface Crumb {
  readonly name: string;
  /** Absent on the last segment, and on a segment there is nothing to navigate to. */
  readonly href?: string;
}

/** The page's own name within its record, matching the rail item that marks it. */
const PAGE_NAMES = {
  editor: "Blok Editor",
  runs: "Runs",
  versions: "Versions",
  deploy: "Deploy",
  connect: "Connect",
  prompts: "Prompts",
  settings: "Settings",
  account: "Account",
  projects: "Projects",
  import: "Import"
} as const;

export function crumbsFor(context: AppRouteContext, names: ShellNames): readonly Crumb[] {
  const { current, promptId, projectId } = context;

  if (current === "projects") return [{ name: PAGE_NAMES.projects }];
  if (current === "settings") return [{ name: PAGE_NAMES.settings }];
  if (current === "account") return [{ name: PAGE_NAMES.account }];

  if (promptId !== undefined && names.promptName !== undefined) {
    const page = current === undefined ? undefined : PAGE_NAMES[current];
    // A prompt route whose fourth segment the rail does not name — a run's results page names
    // `runs`, so this is genuinely unknown ground — shows the prompt alone rather than inventing a
    // name for where it is.
    return page === undefined
      ? [{ name: names.promptName }]
      : [{ name: names.promptName, href: `/app/pr/${promptId}` }, { name: page }];
  }

  if (projectId !== undefined && names.projectName !== undefined) {
    return current === "connect"
      ? [{ name: names.projectName, href: `/app/p/${projectId}` }, { name: PAGE_NAMES.connect }]
      : [{ name: names.projectName }];
  }

  // An unknown route under `/app` still renders inside the layout — a 404 does. `Projects` is the
  // truthful answer for "the workspace", and it is where the rail's first item goes.
  return [{ name: PAGE_NAMES.projects, href: "/app/projects" }];
}
