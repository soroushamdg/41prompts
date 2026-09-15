import { isOptional } from "@41prompts/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { runsPageFor } from "@/lib/runs/queries";
import { requireSession } from "@/lib/session";
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

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/pr/${promptId}`}>{found.prompt.name}</a>
        </p>
        <h1>Runs</h1>
        <p className="app-state">Draft</p>
      </header>

      <InputSets promptId={promptId} sets={found.inputSets} declarations={declarations} />
      <RunHistory promptId={promptId} runs={found.history} />
    </main>
  );
}
