import { isOptional } from "@41prompts/core";
import { resultCountsFor, versionsForPrompt } from "@41prompts/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { activationStateFor } from "@/lib/activation/queries";
import { keyedProvidersFor } from "@/lib/providers/queries";
import { runsPageFor } from "@/lib/runs/queries";
import { requireSession } from "@/lib/session";
import { ActivationProgress } from "./activation-progress";
import { InputSets } from "./input-sets";
import { RunHistory } from "./run-history";

export const metadata: Metadata = { title: "Runs · 41Prompts", robots: { index: false, follow: false } };

/**
 * The runs page: what you can run against, the trigger, and what has been run.
 *
 * Read on the server from the same rows everything else reads, so the input-set list and the
 * history cannot disagree with the database that produced them.
 */
export default async function RunsPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const session = await requireSession(`/app/pr/${promptId}/runs`);

  const found = await runsPageFor(getDb(), promptId, session.user.id);
  // 404, not 403: a 403 would confirm the id is real.
  if (found === undefined) notFound();

  const declarations = found.declarations.map((declaration) => ({
    name: declaration.name,
    optional: isOptional(declaration),
  }));

  // One query for the whole history, not one per row.
  const counts = await resultCountsFor(getDb(), found.history.map((run) => run.id));
  const verdicts = Object.fromEntries(counts);

  // The ordinals the history rows need to say `Ran Draft v3` — the run row carries the version id.
  const versions = await versionsForPrompt(getDb(), promptId);
  const versionsByN = Object.fromEntries(versions.map((version) => [version.id, version.n]));

  // Only on the example: onboarding, not a permanent feature (see `ActivationProgress`).
  const activation = activationStateFor(found.prompt.name, found.history, counts);

  // EPIC-042. Metadata only — no master key is read, and this page cannot open one.
  const keyed = await keyedProvidersFor(getDb(), session.user.id);

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/pr/${promptId}`}>{found.prompt.name}</a>
        </p>
        <h1>Runs</h1>
        <p className="app-state">Draft</p>
        <span className="app-pagehead-actions">
          <a className="btn btn-sm app-pagehead-action" href={`/app/pr/${promptId}/versions`}>
            Versions
          </a>
        </span>
      </header>

      {activation !== undefined && <ActivationProgress steps={activation} />}

      <InputSets
        promptId={promptId}
        sets={found.inputSets}
        declarations={declarations}
        keyedProviders={keyed.length}
      />
      <RunHistory promptId={promptId} runs={found.history} verdicts={verdicts} versionsByN={versionsByN} />
    </main>
  );
}
