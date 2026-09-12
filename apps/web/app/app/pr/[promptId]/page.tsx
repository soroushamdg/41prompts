import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canvasForOwner, compiledForBloks } from "@/lib/canvas/queries";
import { compiledView } from "@/lib/canvas/compiled-view";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { Editor } from "./editor";

export const metadata: Metadata = { title: "Canvas · 41Prompts", robots: { index: false, follow: false } };

export default async function PromptPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const session = await requireSession(`/app/pr/${promptId}`);

  const found = await canvasForOwner(getDb(), promptId, session.user.id);
  // 404, not 403 (decision 3): a 403 would confirm the id is real.
  if (found === undefined) notFound();

  // Compiled on the server from the same rows the canvas renders, with hand edits carried through.
  const { compiled, bloks, hashes } = compiledForBloks(found.bloks);

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/p/${found.prompt.project}`}>Project</a>
        </p>
        <h1>{found.prompt.name}</h1>
        <p className="app-state">Draft</p>
      </header>

      <Editor
        promptId={promptId}
        bloks={found.bloks}
        pieces={compiledView(compiled, bloks)}
        hashes={Object.fromEntries(hashes)}
      />
    </main>
  );
}
