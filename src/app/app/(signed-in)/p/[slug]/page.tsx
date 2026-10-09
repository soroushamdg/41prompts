import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { getPromptBySlug } from "@/server/prompts";
import { requireViewer } from "@/server/session";

export default async function EditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requireViewer(`/p/${slug}`);
  const prompt = await getPromptBySlug(db, viewer.id, slug);
  if (!prompt) notFound();
  return (
    <>
      <Topbar crumb={prompt.slug} />
      <main id="main" style={{ padding: 32 }}>
        <h1>{prompt.slug}</h1>
      </main>
    </>
  );
}
