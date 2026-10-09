import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { listConnections } from "@/server/connections";
import { getPromptBySlug, headBloks, listPrompts } from "@/server/prompts";
import { requireViewer } from "@/server/session";
import { listVersions } from "@/server/versions";
import { Editor } from "./editor";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  return { title: (await params).slug };
}

export default async function EditorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const viewer = await requireViewer(`/p/${slug}`);
  const prompt = await getPromptBySlug(db, viewer.id, slug);
  if (!prompt) notFound();
  const [bloks, versions, library, models] = await Promise.all([
    headBloks(db, prompt.id, prompt.headVersion),
    listVersions(db, prompt.id),
    listPrompts(db, viewer.id),
    listConnections(db, viewer.id),
  ]);
  const n = models.length;
  const modelsLabel = n === 0 ? "No models yet · add one" : `${n} ${n === 1 ? "model" : "models"}`;
  return (
    <>
      <Topbar crumb={prompt.slug} />
      <Editor
        userId={viewer.id}
        prompt={{ id: prompt.id, slug: prompt.slug, sheetNumber: prompt.sheetNumber, nextBlokId: prompt.nextBlokId, fillValues: prompt.fillValues }}
        bloks={bloks}
        versions={versions}
        rail={library.filter((p) => !p.archived)}
        models={models}
        modelsLabel={modelsLabel}
      />
    </>
  );
}
