/**
 * What the rail and the top bar need to know about the current route, derived from its path alone.
 *
 * Pure, and deliberately so: the shell's whole information architecture is a table plus a parser,
 * both of which a unit test can exercise without a request, a database or a render. The mockup's
 * rail (lines 1043–1070) is three groups, two of which are contextual, and getting the group set
 * right for a route is the one thing in this epic that a screenshot cannot prove.
 *
 * **The path arrives from `proxy.ts` as `x-41p-path`.** A Next.js layout is given the params of its
 * own segment and no deeper, so `app/app/layout.tsx` — which sits at `/app` — never sees
 * `[projectId]` or `[promptId]`. The proxy already parses `pathname` on every `/app/*` request;
 * forwarding it costs three lines there and removes the alternative, which was a second rail
 * rendered by a nested layout inside the first one.
 */

/** Every destination the rail can mark as current. One per rail item. */
export type RailItemId =
  | "projects"
  | "import"
  | "connect"
  | "prompts"
  | "editor"
  | "runs"
  | "versions"
  | "deploy"
  | "settings"
  | "account";

export interface AppRouteContext {
  /** Present on `/app/p/<id>/…`, and on a prompt route once its project is known. */
  readonly projectId?: string;
  /** Present on `/app/pr/<id>/…`. */
  readonly promptId?: string;
  /** Which rail item is current, or `undefined` on a route the rail does not name. */
  readonly current?: RailItemId;
}

/**
 * Ids are `proj_` + 4 hex and `pr_` + 8 hex (`CLAUDE.md`, Naming). Matching the shape rather than
 * `[^/]+` means a path that cannot be an id yields no context instead of a rail group headed with
 * whatever someone put in the URL bar.
 */
const PROJECT_ID = /^proj_[0-9a-f]{4}$/;
const PROMPT_ID = /^pr_[0-9a-f]{8}$/;

/**
 * Settings is several routes joined by links (EPIC-055: a control that changes the URL is a link),
 * so every one of them marks the same rail item.
 */
function settingsOrAccount(segments: readonly string[]): RailItemId | undefined {
  if (segments[1] === "settings") return "settings";
  if (segments[1] === "account") return "account";
  return undefined;
}

/**
 * Parse `/app/…` into the context the shell renders from.
 *
 * Anything it does not recognise returns `{}`, which renders the rail with its two permanent groups
 * and nothing marked current. That is the right answer for an unknown route and it is also the
 * right answer for a 404, which still renders inside the layout.
 */
export function routeContext(pathname: string): AppRouteContext {
  const segments = pathname.split("/").filter((segment) => segment.length > 0);
  if (segments[0] !== "app") return {};

  const settings = settingsOrAccount(segments);
  if (settings !== undefined) return { current: settings };

  if (segments[1] === "projects") return { current: "projects" };

  if (segments[1] === "p" && segments[2] !== undefined && PROJECT_ID.test(segments[2])) {
    return {
      projectId: segments[2],
      current: segments[3] === "connect" ? "connect" : segments[3] === undefined ? "prompts" : undefined
    };
  }

  if (segments[1] === "pr" && segments[2] !== undefined && PROMPT_ID.test(segments[2])) {
    return { promptId: segments[2], current: promptItem(segments[3]) };
  }

  return {};
}

/**
 * `/runs/<runId>` marks Runs, not nothing: a run's results page is reached through Runs and belongs
 * to it. The mockup has no separate rail item for it and neither does this.
 */
function promptItem(fourth: string | undefined): RailItemId | undefined {
  if (fourth === undefined) return "editor";
  if (fourth === "runs") return "runs";
  if (fourth === "versions") return "versions";
  if (fourth === "deploy") return "deploy";
  return undefined;
}
