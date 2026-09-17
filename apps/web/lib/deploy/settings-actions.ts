"use server";

import { projects } from "@41prompts/db";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";

/**
 * Settings → Publishing (EPIC-055).
 *
 * One switch. `projects.admin_only_publish` has existed since EPIC-051, defaults to `true`, and is
 * read by `mayPublish` on every publish — **nothing has ever written it**, which is what this file
 * is for.
 *
 * The mockup's second switch, "Require passing checks", is not here and is not an oversight:
 * EPIC-051 ruling 4 refused it, because an account-wide off-switch for `CLAUDE.md` rule 9 makes the
 * product's central sentence false for that account, permanently and invisibly. Rule 9's own escape
 * is "Publish anyway", which names a person and a reason and writes an audit row. The page says so
 * out loud beside the switch that does exist (ruling 7).
 */

const PUBLISHING_PATH = "/app/settings/publishing";

export interface PublishingActionResult {
  ok: boolean;
  message?: string;
}

export async function setAdminOnlyPublishAction(
  projectId: string,
  adminOnly: boolean,
): Promise<PublishingActionResult> {
  const session = await requireSession(PUBLISHING_PATH);

  // Scoped by owner in the `where`, not by a read first: one statement that cannot be raced, and a
  // project that is not this person's simply matches nothing.
  const moved = await getDb()
    .update(projects)
    .set({ adminOnlyPublish: adminOnly })
    .where(and(eq(projects.id, projectId), eq(projects.owner, session.user.id)))
    .returning({ id: projects.id });

  if (moved.length === 0) return { ok: false, message: "That project is not available." };

  revalidatePath(PUBLISHING_PATH);
  return {
    ok: true,
    message: adminOnly
      ? "Only an admin can move a prompt to Live in this project."
      : "Anyone in this project can move a prompt to Live.",
  };
}
