import { liveFor, newestVersion, projects, promptForOwner, type Db } from "@41prompts/db";
import { and, eq, isNull } from "drizzle-orm";
import { cache } from "react";

/**
 * The four reads the shell needs, each wrapped in React's `cache()`.
 *
 * ## Why `cache()` and not a prop
 *
 * The rail heads its middle group with a record's **name** and the top bar shows `Draft vN ·
 * Live vM`. The layout renders those, and a layout cannot be handed data by the page beneath it —
 * server components do not compose upward. So the layout reads.
 *
 * `cache()` makes that read free wherever the page below reads the same row: it memoises on
 * argument identity for the duration of one render pass, and a layout and its page render in the
 * same pass. `getDb()` is a module-level singleton (`lib/db.ts`), so the `db` argument is
 * referentially stable and the key holds.
 *
 * **It only dedupes callers that go through these functions.** A page calling
 * `newestVersion(getDb(), id)` directly gets its own round trip; a page calling `promptVersion(id)`
 * from here shares the layout's. The prompt page is wired through these for that reason; the other
 * prompt routes are not, and each therefore costs the extra lookups below.
 *
 * ## What it costs where it does not dedupe
 *
 * Three lookups, all on an indexed column and all `limit 1`: the prompt by primary key with a join
 * to `projects` for the ownership scope, the newest version by `prompt`, and the newest publish
 * event by `prompt`. `names.test.ts` counts them, so the number in the report is measured rather
 * than asserted.
 *
 * ## Every read is scoped by owner
 *
 * `promptForOwner` and `projectNamed` both join through `projects.owner`. The shell must not become
 * the one place in the app that renders a name without asking whose it is — a rail heading is still
 * a disclosure. The version and publish reads take a prompt id that has already been resolved for
 * this owner, which is the same order every route already uses.
 */

/** The prompt, if this owner can reach it. `undefined` also covers a soft-deleted one. */
export const shellPrompt = cache(
  async (db: Db, promptId: string, owner: string) => promptForOwner(db, promptId, owner)
);

/** A project's name, if this owner can reach it. */
export const shellProjectName = cache(
  async (db: Db, projectId: string, owner: string): Promise<string | undefined> => {
    const [row] = await db
      .select({ name: projects.name })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.owner, owner), isNull(projects.deletedAt)))
      .limit(1);
    return row?.name;
  }
);

/**
 * The newest version of a prompt, for the top bar's `Draft vN`.
 *
 * Takes a prompt id that a caller has already resolved for this owner. It is not a second
 * ownership check and does not pretend to be one.
 */
export const shellNewestVersion = cache(async (db: Db, promptId: string) =>
  newestVersion(db, promptId)
);

/** The newest publish event, for the top bar's `Live vM`. Same ownership note as above. */
export const shellLive = cache(async (db: Db, promptId: string) => liveFor(db, promptId));
