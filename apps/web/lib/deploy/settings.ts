import { eq } from "drizzle-orm";
import { projects, type Db } from "@41prompts/db";

/**
 * A project's publishing settings (EPIC-051).
 *
 * One switch, and the mockup's second one is deliberately absent — see `projects.admin_only_publish`
 * and EPIC-051 ruling 4.
 */
export interface ProjectPublishSettings {
  owner: string;
  adminOnlyPublish: boolean;
}

export async function publishSettingsFor(db: Db, projectId: string): Promise<ProjectPublishSettings | undefined> {
  const [row] = await db
    .select({ owner: projects.owner, adminOnlyPublish: projects.adminOnlyPublish })
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  return row;
}

/**
 * Whether this person may move this project's prompts to Live.
 *
 * **With no team model the only member of a project is its owner, and the owner is its admin**, so
 * this returns true whenever the project resolved for that person. Team collaboration is on
 * `docs/backlog.md`'s cut list for v1.
 *
 * It exists as a real function rather than an inlined `true` because the criterion is that the check
 * *runs*: a check that does not exist cannot start working when the team model arrives, and the
 * switch's value would then be a column nobody reads. This is the one line that has to learn about
 * roles, and it is already the line being executed.
 */
export async function mayPublish(db: Db, projectId: string, person: string): Promise<boolean> {
  const settings = await publishSettingsFor(db, projectId);
  if (settings === undefined) return false;
  return settings.adminOnlyPublish ? settings.owner === person : true;
}
