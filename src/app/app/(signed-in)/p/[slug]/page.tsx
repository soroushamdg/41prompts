import { notFound } from "next/navigation";
import { Topbar } from "@/components/shell/topbar";
import { db } from "@/db";
import { PROVIDER_ORDER } from "@/lib/providers";
import { listKeys } from "@/server/keys";
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
  const [bloks, versions, library, keys] = await Promise.all([
    headBloks(db, prompt.id, prompt.headVersion),
    listVersions(db, prompt.id),
    listPrompts(db, viewer.id),
    listKeys(db, viewer.id),
  ]);
  const n = keys.length;
  const keysLabel = n === 0 ? "No model keys yet · add one" : `${n} of ${PROVIDER_ORDER.length} model keys connected`;
  return (
    <>
      <Topbar crumb={prompt.slug} />
      <Editor
        userId={viewer.id}
        prompt={{ id: prompt.id, slug: prompt.slug, sheetNumber: prompt.sheetNumber, nextBlokId: prompt.nextBlokId, fillValues: prompt.fillValues }}
        bloks={bloks}
        versions={versions}
        rail={library.filter((p) => !p.archived)}
        keys={keys}
        keysLabel={keysLabel}
      />
    </>
  );
}
