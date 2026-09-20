import { headers } from "next/headers";
import type { ReactNode } from "react";
import { signOutAction } from "@/lib/account-actions";
import { routeContext } from "@/lib/app-shell/context";
import { crumbsFor } from "@/lib/app-shell/crumbs";
import { railGroups, type ShellNames } from "@/lib/app-shell/groups";
import { shellLive, shellNewestVersion, shellProjectName, shellPrompt } from "@/lib/app-shell/names";
import { getDb } from "@/lib/db";
import { liveName } from "@/lib/deploy/view";
import { requireSession } from "@/lib/session";
import { siteOrigin } from "@/lib/site/url";
import { versionName } from "@/lib/versions/view";
import { APP_PATH_HEADER } from "@/proxy";
import { AppRail } from "./app-rail";
import { AppTopBar } from "./app-topbar";

/**
 * The chrome every signed-in page shares: the mockup's 216px rail and its sticky top bar.
 *
 * ## What this replaced, and why it had to
 *
 * Until EPIC-023 this was a single horizontal strip — `Projects … email · Settings · Account ·
 * Sign out` — and its own comment said what it was standing in for: *"a left rail whose foot shows
 * who you are, with an 'Account' group above it […] it is where the rail goes when Stage 3 builds
 * it."*
 *
 * Stage 3 built runs, attribution, a judge and activation, and did not build the rail, because no
 * criterion asked for one. The word "rail" appears nowhere in `docs/roadmap.md`, `docs/backlog.md`
 * or any of the 44 epic files. Stages 4 and 5a then added Versions, Providers, Deploy, Connect and
 * Settings — five more destinations hung off chrome designed to hold none of them.
 *
 * Measured on the built app before this change: from a prompt you reached Runs and Versions by
 * buttons in the page head, Deploy by a third, and **Connect not at all** — it lives under the
 * project, and nothing on a prompt page linked to it.
 *
 * ## How the layout knows where it is
 *
 * A Next.js layout is given the params of its own segment and no deeper, and this one sits at
 * `/app`. `proxy.ts` — which already parses `pathname` on every `/app/*` request — forwards it as
 * `x-41p-path`, and `routeContext` turns it into the ids and the current item. The alternative was
 * a second rail in a nested layout, nested inside this one.
 *
 * ## The reads
 *
 * Three at most, each indexed and `limit 1`, and each wrapped in React's `cache()` so that a page
 * asking for the same row in the same render pass shares the round trip rather than making a second
 * one. `lib/app-shell/names.ts` carries the argument and the measurement.
 *
 * `requireSession` runs here so every route beneath is behind auth by construction. The pages still
 * call it for their own redirect-back path, which is cheap and keeps a deep link's `next` accurate.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession("/app/projects");

  const context = routeContext((await headers()).get(APP_PATH_HEADER) ?? "");
  const db = getDb();
  const origin = await siteOrigin();

  // Only ever one of these two branches does any work: a route is inside a prompt or inside a
  // project, never both, and most routes are inside neither.
  const prompt =
    context.promptId === undefined
      ? undefined
      : await shellPrompt(db, context.promptId, session.user.id);

  // A prompt route needs its project's name as well, because the rail shows the project a prompt is
  // inside. `cache()` means this costs nothing extra on a project route, where the same id is asked
  // for twice.
  const projectId = prompt?.project ?? context.projectId;
  const projectName =
    projectId === undefined ? undefined : await shellProjectName(db, projectId, session.user.id);

  const names: ShellNames = {
    projectName,
    promptName: prompt?.name,
    promptProjectId: prompt?.project
  };

  // **One set of props, two renders.** The column above 940px and the disclosure below it, from one
  // object, so the two can never drift into different group sets — the defect a second copy
  // produces, and the one this repository has refused six times.
  //
  // `compact` is the single difference, and it is not cosmetic: it drops the email so the address
  // appears once in the document at any width. `app-rail.tsx` carries the reason.
  const railProps = {
    groups: railGroups({ ...names, ...context, siteOrigin: origin }),
    current: context.current,
    email: session.user.email,
    siteHref: origin,
    signOut: (
      <form action={signOutAction}>
        <button className="app-rail-signout" type="submit">
          Sign out
        </button>
      </form>
    )
  };

  return (
    <div className="app-shell">
      {/* **The rail made this necessary, and the criterion that asked for it was nearly ticked on a
          page that had none.** `/app` has never had a skip link: the chrome it replaced was four
          controls, which is a short enough tab to be tolerable. The rail is ten links plus a top
          bar, in front of every page's content, on every navigation — so a keyboard reader would
          have tabbed past all of it to reach the canvas, every time.

          `SiteNav` carries the same link for the public pages and says the same thing: it belongs
          to the chrome, so a page cannot be built without it. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <div className="app-shell-rail">
        <AppRail {...railProps} />
      </div>

      <div className="app-shell-main">
        <AppTopBar
          crumbs={crumbsFor(context, names)}
          versionState={prompt === undefined ? undefined : await versionStateFor(prompt.id)}
          primaryAction={
            prompt === undefined
              ? undefined
              : { name: "Run suite", href: `/app/pr/${prompt.id}/runs` }
          }
          siteHref={origin}
          menu={
            /* The mockup's grid collapses to one column below 940px, which would stack a nine-item
               rail above every page. A disclosure instead — `<details>`, so it opens and closes by
               keyboard with no JavaScript, and `ThemeToggle` stays the shell's only client
               component. `app-shell.css` hides the column and shows this one at the same
               breakpoint, so exactly one of the two is ever in the accessibility tree. */
            <details className="app-shell-menu">
              <summary>Menu</summary>
              <div className="app-shell-menu-body">
                  <AppRail {...railProps} compact />
                </div>
            </details>
          }
        />
        {/* The target. Public pages put `id="main"` on their own `<main>`; a layout cannot reach
            inside a page to do that, so it wraps. `tabIndex={-1}` is what makes the link move
            focus rather than only scroll. */}
        <div id="main" tabIndex={-1} className="app-shell-content">
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * `Draft vN`, and `Draft vN · Live vM` once something has been published.
 *
 * A prompt with no bloks has no version yet and then there is genuinely nothing to name — the same
 * case the prompt page already handles, and the same two functions, so the chrome and the page
 * cannot drift into two spellings of one state.
 */
async function versionStateFor(promptId: string): Promise<string | undefined> {
  const db = getDb();
  const version = await shellNewestVersion(db, promptId);
  if (version === undefined) return undefined;

  const live = await shellLive(db, promptId);
  return live === undefined
    ? versionName(version)
    : `${versionName(version)} · ${liveName(live.versionN)}`;
}
