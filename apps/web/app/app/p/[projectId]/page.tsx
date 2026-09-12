import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPrompts } from "@/lib/canvas/queries";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { CreatePrompt } from "./create-prompt";

export const metadata: Metadata = { title: "Project · 41Prompts", robots: { index: false, follow: false } };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await requireSession(`/app/p/${projectId}`);

  const found = await listPrompts(getDb(), projectId, session.user.id);
  // 404, not 403 (decision 3). A 403 confirms the id exists, which is a disclosure on its own.
  if (found === undefined) notFound();

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href="/app/projects">Projects</a>
        </p>
        <h1>{found.project.name}</h1>
      </header>

      <CreatePrompt projectId={projectId} />

      {found.prompts.length === 0 ? (
        <p className="app-empty">No prompts yet.</p>
      ) : (
        <ul className="app-list">
          {found.prompts.map((prompt) => (
            <li key={prompt.id}>
              <a href={`/app/pr/${prompt.id}`}>{prompt.name}</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
