import { projects } from "@41prompts/db";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { SettingsNav } from "../settings-nav";
import { PublishingSettings } from "./publishing-settings";

export const metadata: Metadata = {
  title: "Publishing · 41Prompts",
  robots: { index: false, follow: false },
};

/**
 * Settings → Publishing (EPIC-055).
 *
 * One switch, and a paragraph saying why there is only one. `projects.admin_only_publish` has been
 * a column since EPIC-051 and `mayPublish` has been reading it on every publish; nothing has ever
 * written it. This is the screen that does.
 */
export default async function PublishingSettingsPage() {
  const session = await requireSession("/app/settings/publishing");

  const rows = await getDb()
    .select({ id: projects.id, name: projects.name, adminOnlyPublish: projects.adminOnlyPublish })
    .from(projects)
    .where(and(eq(projects.owner, session.user.id), isNull(projects.deletedAt)))
    .orderBy(asc(projects.createdAt));

  return (
    <main className="app-page app-page-wide">
      <header className="app-pagehead">
        <h1>Publishing</h1>
        <p className="app-state">Settings</p>
      </header>

      <SettingsNav current="publishing" />
      <PublishingSettings projects={rows} />
    </main>
  );
}
