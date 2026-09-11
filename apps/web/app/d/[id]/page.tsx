import { cluster, detect, heuristicSummariser, segment, uncheckedRuleCount } from "@41prompts/core";
import { decompiles } from "@41prompts/db";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { buildView } from "@/lib/decompile/view-model";
import { SharedDecompileView } from "./shared-view";

/**
 * `/d/<id>` — a shared decompile.
 *
 * **Recomputed from the stored source, never served as cached HTML** (EPIC-014 decision 1). A core
 * fix — a better summary, a new finding, a corrected range — improves every link ever shared, and a
 * stored rendering would freeze whichever bugs existed on the day somebody pressed Share.
 *
 * The source is used exactly as stored, CRLF and all: the offsets the pipeline produces index that
 * string, and normalising it here would move every highlight in the page.
 */

export const dynamic = "force-dynamic";

/**
 * `noindex, nofollow` as metadata **and** as a header (decision 2).
 *
 * Both, because they are read by different things: a crawler that fetches without executing or
 * parsing the document still sees the header, and the meta tag covers a client that has the HTML but
 * not the response. A shared link is for a colleague, not for a search engine — `/decompile` itself
 * is indexable and this is not.
 */
export const metadata: Metadata = {
  title: "A shared prompt · 41Prompts",
  robots: { index: false, follow: false, nocache: true }
};

export default async function SharedDecompilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [row] = await getDb().select().from(decompiles).where(eq(decompiles.id, id)).limit(1);
  // A removed or expired link is a 404, not an error page. Somebody following a colleague's link to
  // something that has been deleted has not done anything wrong, and "gone" is the honest answer.
  if (row === undefined) notFound();

  const source = row.source;
  const bloks = cluster(segment(source));
  const findings = detect(bloks, source);
  const summaries = new Map(
    bloks.map((blok) => {
      const summary = heuristicSummariser.summarise(blok, source);
      return [blok.id, { text: summary.text, source: summary.source }] as const;
    })
  );

  const view = buildView({
    source,
    bloks,
    findings,
    summaries,
    uncheckedRuleTotal: uncheckedRuleCount(bloks, source, findings)
  });

  return <SharedDecompileView id={id} view={view} createdAt={row.createdAt.toISOString()} />;
}
