import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canvasForOwner, compiledForBloks } from "@/lib/canvas/queries";
import { compiledView } from "@/lib/canvas/compiled-view";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { variablesViewFor } from "@/lib/variables/queries";
import { variablesForPrompt } from "@41prompts/db";
import { Editor } from "./editor";
import { VariablesTab } from "./variables-tab";
import { Workbench } from "./workbench";

export const metadata: Metadata = { title: "Canvas · 41Prompts", robots: { index: false, follow: false } };

export default async function PromptPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const session = await requireSession(`/app/pr/${promptId}`);

  const found = await canvasForOwner(getDb(), promptId, session.user.id);
  // 404, not 403 (decision 3): a 403 would confirm the id is real.
  if (found === undefined) notFound();

  // Compiled on the server from the same rows the canvas renders, with hand edits carried through.
  const { compiled, bloks, hashes } = compiledForBloks(found.bloks);

  // The same rows again, not a second read: extraction and compilation must agree about which text
  // ships, and they cannot if they are looking at two snapshots.
  const declarations = await variablesForPrompt(getDb(), promptId);
  const variables = variablesViewFor(found.bloks, declarations);

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/p/${found.prompt.project}`}>Project</a>
        </p>
        <h1>{found.prompt.name}</h1>
        <p className="app-state">Draft</p>
        {/* The mockup's page head carries a run action. It is a link rather than a button because
            it goes somewhere — the runs page, where an input set is chosen — and a button that
            navigates is a link wearing a costume. */}
        <a className="btn btn-pri btn-sm app-pagehead-action" href={`/app/pr/${promptId}/runs`}>
          Run
        </a>
      </header>

      <Workbench
        editor={
          <Editor
            promptId={promptId}
            bloks={found.bloks}
            pieces={compiledView(compiled, bloks)}
            hashes={Object.fromEntries(hashes)}
          />
        }
        variables={
          <VariablesTab
            promptId={promptId}
            declarations={variables.declarations}
            issues={variables.issues}
            occurrences={variables.occurrences}
            compiledText={compiled.text}
          />
        }
      />
    </main>
  );
}
