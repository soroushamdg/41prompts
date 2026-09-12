import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canvasForOwner } from "@/lib/canvas/queries";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { Canvas } from "./canvas";

export const metadata: Metadata = { title: "Canvas · 41Prompts", robots: { index: false, follow: false } };

export default async function PromptPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const session = await requireSession(`/app/pr/${promptId}`);

  const found = await canvasForOwner(getDb(), promptId, session.user.id);
  // 404, not 403 (decision 3): a 403 would confirm the id is real.
  if (found === undefined) notFound();

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/p/${found.prompt.project}`}>Project</a>
        </p>
        <h1>{found.prompt.name}</h1>
        <p className="app-state">Draft</p>
      </header>

      <Canvas promptId={promptId} initial={found.bloks} />
    </main>
  );
}
