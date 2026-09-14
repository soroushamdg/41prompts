import { redirect } from "next/navigation";

/**
 * `/app` is not a page. It is where sign-in used to land, and it was a dead end.
 *
 * It rendered "Signed in as …", a Sign out button and a link to Account, in a bare `<main>` with no
 * styling and no project list — and nothing on it linked to `/app/projects`, so every user who
 * signed in was stranded on it. Live from EPIC-021a until 2026-09-14.
 *
 * The mockup settles what should be here: its app nav opens on **Projects** and has no separate
 * home, so `/app` is a redirect rather than a page. `DEFAULT_NEXT_PATH` now points straight at
 * `/app/projects`; this redirect catches bookmarks, old `?next=/app` links, and anything else still
 * aimed here.
 */
export default function AppIndexPage() {
  redirect("/app/projects");
}
