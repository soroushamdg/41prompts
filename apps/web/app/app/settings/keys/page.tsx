import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import { keyedProjectsFor } from "@/lib/keys/queries";
import { requireSession } from "@/lib/session";
import { SettingsNav } from "../settings-nav";
import { ApiKeys } from "./api-keys";

export const metadata: Metadata = {
  title: "API keys · 41Prompts",
  robots: { index: false, follow: false },
};

/**
 * Settings → API keys (EPIC-055).
 *
 * The one screen this product has never had. Both `drive-epic-051.mts` and `drive-epic-052.mts`
 * mint a key by calling `createApiKey` directly and say in their headers that they do so because
 * there is no UI; EPIC-055's drive is the first that does not have to.
 *
 * ## Grouped by project, and the project is named on every key
 *
 * `api_keys.project` is a foreign key: a key resolves prompts in exactly one project. A flat list
 * would be a list of strings that look interchangeable and are not. See `lib/keys/queries.ts`.
 *
 * ## This page cannot show you an existing key
 *
 * `createApiKey` returns the plaintext once and the row keeps only a digest and the last four —
 * EPIC-002 decision 4, "no key material in plaintext, ever". So a key you did not copy is a key you
 * rotate, which is why Rotate is beside every row rather than buried.
 */
export default async function ApiKeysSettingsPage() {
  const session = await requireSession("/app/settings/keys");
  const projects = await keyedProjectsFor(getDb(), session.user.id);

  return (
    <main className="app-page app-page-wide">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href="/app/projects">Projects</a>
        </p>
        <h1>API keys</h1>
        <p className="app-state">Settings</p>
      </header>

      <SettingsNav current="keys" />

      <ApiKeys
        projects={projects.map((project) => ({
          id: project.id,
          name: project.name,
          live: project.keys.live.map(asView),
          revoked: project.keys.revoked.map(asView),
        }))}
      />
    </main>
  );
}

/** Dates cross to the client as strings: a `Date` is not serialisable across the boundary. */
function asView(key: {
  id: string;
  name: string;
  lastFour: string;
  environment: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    id: key.id,
    name: key.name,
    lastFour: key.lastFour,
    environment: key.environment,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  };
}
