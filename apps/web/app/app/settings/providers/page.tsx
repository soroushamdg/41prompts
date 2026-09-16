import { PROVIDER_TITLES, modelsForProvider } from "@41prompts/db";
import type { Metadata } from "next";
import { getDb } from "@/lib/db";
import {
  KEY_GUIDANCE_ACTIONS,
  KEY_GUIDANCE_HOLDING,
  KEY_GUIDANCE_SUMMARY,
  KEY_GUIDANCE_TITLE,
  PROVIDER_NOTES,
} from "@/lib/providers/key-guidance";
import { providerRowsFor } from "@/lib/providers/queries";
import { requireSession } from "@/lib/session";
import { ProviderKeys } from "./provider-keys";

export const metadata: Metadata = {
  title: "Providers · 41Prompts",
  robots: { index: false, follow: false },
};

/**
 * Settings → Providers: the keys a person brings, and what we do with them.
 *
 * ## Why this is a page and not a tab
 *
 * The mockup's Settings screen has five tabs — Providers, API keys, Publishing, Team, Billing — and
 * four of them belong to Stage 5a and Stage 6. **A tablist with one tab in it is not a tablist**: it
 * would put real ARIA tabs on the page to describe a set of one, and it would imply four screens
 * that do not exist. When the others arrive this page becomes the first panel of them.
 *
 * ## The guidance is above the box, and it is EPIC-043's own words
 *
 * `lib/providers/key-guidance.ts` is one module with two render sites: `/legal/security`, where a
 * person reads it while deciding, and here, where they read it while typing. Two renderings of one
 * source, so the two can never disagree.
 *
 * ## Nothing on this page can open a key
 *
 * `providerRowsFor` reads metadata and takes no master key. The last four characters are what a
 * provider's own console shows, and are the whole of what is displayed.
 */
export default async function ProvidersSettingsPage() {
  const session = await requireSession("/app/settings/providers");
  const rows = await providerRowsFor(getDb(), session.user.id);

  const providers = rows.map((row) => ({
    provider: row.provider,
    title: PROVIDER_TITLES[row.provider],
    // The model a matrix run would use at this provider, so the page says what a key buys.
    models: modelsForProvider(row.provider).map((model) => model.name),
    // What is true of this provider and not of the others. Today only Google has one.
    note: PROVIDER_NOTES[row.provider],
    key: row.key,
  }));

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href="/app/projects">Projects</a>
        </p>
        <h1>Providers</h1>
        <p className="app-state">Settings</p>
      </header>

      <section className="runs-panel" aria-label={KEY_GUIDANCE_TITLE}>
        <h2>{KEY_GUIDANCE_TITLE}</h2>
        <p className="runs-note">{KEY_GUIDANCE_SUMMARY}</p>
        <ul className="settings-guidance">
          {KEY_GUIDANCE_ACTIONS.map((action) => (
            <li key={action.action}>
              <b>{action.action}</b>
              <span>{action.because}</span>
            </li>
          ))}
        </ul>
        <h3>How we hold it</h3>
        <ul className="settings-guidance settings-guidance-plain">
          {KEY_GUIDANCE_HOLDING.map((line) => (
            <li key={line}>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>

      <ProviderKeys providers={providers} />
    </main>
  );
}
