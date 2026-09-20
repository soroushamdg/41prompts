import { DEFAULT_RUN_MODEL, publishHistory } from "@41prompts/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { previewPublish } from "@/lib/deploy/publish";
import { GATE_TITLES, HISTORY_WORDS, VERDICT_WORDS, blockingWords, liveName, shortBuild } from "@/lib/deploy/view";
import { gatePhrase } from "@/lib/deploy/words";
import { requireSession } from "@/lib/session";
import { versionName } from "@/lib/versions/view";
import { promptForOwner } from "@41prompts/db";
import { DeployView } from "./deploy-view";

export const metadata: Metadata = { title: "Deploy · 41Prompts", robots: { index: false, follow: false } };

/**
 * The Deploy page (EPIC-055).
 *
 * Live beside Draft, the gate that decides whether one can become the other, and the history of
 * every time it has.
 *
 * ## The gate shown here is the gate the endpoint enforces
 *
 * `previewPublish` is `publishVersion` with the writes removed — one evaluation with two callers
 * (ruling 5). The alternative was this page computing its own verdict, which would disagree with the
 * endpoint the first time either changed, silently and in both directions.
 *
 * **Everything is computed on the server.** The client component below exists for the three buttons
 * that POST and the two reasons somebody types into; it receives plain data and has no opinion about
 * any of it.
 *
 * ## `force-dynamic`
 *
 * What is Live is derived from the newest `publish_events` row (EPIC-051), so this page is a
 * question about the present. A cached copy of it would tell somebody their prompt is still Live on
 * a version they undid ten seconds ago, which is the one thing this page must never do.
 */
export const dynamic = "force-dynamic";

export default async function DeployPage({ params }: { params: Promise<{ promptId: string }> }) {
  const { promptId } = await params;
  const session = await requireSession(`/app/pr/${promptId}/deploy`);

  const prompt = await promptForOwner(getDb(), promptId, session.user.id);
  // 404, not 403: a 403 would confirm the id is real. The house rule.
  if (prompt === undefined) notFound();

  const preview = await previewPublish({
    db: getDb(),
    promptId,
    owner: session.user.id,
    targetModel: DEFAULT_RUN_MODEL,
  });

  const history = await publishHistory(getDb(), promptId);

  // A refusal here is not a 404 — the prompt resolved. It is a page that says what is wrong and
  // offers nothing to press, which is the honest rendering of "this cannot be published at all".
  if (!preview.ok) {
    return (
      <main className="app-page app-page-wide">
        <Head promptId={promptId} />
        <section className="runs-panel" aria-label="This cannot be published">
          <h2>This cannot be published yet</h2>
          <p className="runs-note">{refusalWords(preview.refusal.kind)}</p>
        </section>
      </main>
    );
  }

  const { version, artifact, report, live, liveVersion } = preview.value;

  return (
    <main className="app-page app-page-wide">
      <Head promptId={promptId} />

      <DeployView
        promptId={promptId}
        draft={{
          name: versionName(version),
          when: version.createdAt.toISOString(),
          buildHash: artifact.buildHash,
          shortBuild: shortBuild(artifact.buildHash),
        }}
        live={
          live === null
            ? null
            : {
                name: liveName(live.versionN),
                when: live.createdAt.toISOString(),
                buildHash: live.buildHash,
                shortBuild: shortBuild(live.buildHash),
                kind: live.kind,
                isSameVersion: liveVersion?.id === version.id,
              }
        }
        gate={{
          blocked: report.blocked,
          rows: report.rows.map((row) => ({
            kind: row.kind,
            title: GATE_TITLES[row.kind],
            verdict: row.verdict,
            verdictWord: VERDICT_WORDS[row.verdict],
            says: gatePhrase(row.reason),
            blocking: row.blocking,
            blockingWords: blockingWords(row.blocking, row.verdict),
          })),
        }}
        history={history.map((event) => ({
          id: event.id,
          when: event.createdAt.toISOString(),
          what: HISTORY_WORDS[event.kind],
          kind: event.kind,
          version: event.kind === "undone" ? liveName(event.versionN) : `v${event.versionN}`,
          reason: event.reason,
          shortBuild: shortBuild(event.buildHash),
        }))}
      />
    </main>
  );
}

function Head({ promptId }: { promptId: string }) {
  return (
    <header className="app-pagehead">
      <h1>Deploy</h1>
      <span className="app-pagehead-actions">
        <a className="btn btn-sm app-pagehead-action" href={`/app/pr/${promptId}/versions`}>
          Versions
        </a>
        <a className="btn btn-sm app-pagehead-action" href={`/app/pr/${promptId}/runs`}>
          Runs
        </a>
      </span>
    </header>
  );
}

/**
 * The refusals this page can meet, as sentences.
 *
 * `words.ts` owns the ones a route returns with a status; these three are the ones that reach a
 * rendered page, and the wording differs because a page is not answering a request — it is telling
 * somebody standing in front of it why there is nothing to press.
 */
function refusalWords(kind: string): string {
  switch (kind) {
    case "no_such_version":
      return "This prompt has no version yet. Add a blok, and a version is written the moment you do.";
    case "not_permitted":
      return "Only an admin may move this prompt to Live. Settings → Publishing says who that is.";
    default:
      return "This version's bloks cannot be read, so nothing can be built from them.";
  }
}
