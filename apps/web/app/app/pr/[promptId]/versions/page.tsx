import { diff } from "@41prompts/core";
import type { VersionRow } from "@41prompts/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { snapshotOf, versionsPageFor, VERSIONS_SHOWN } from "@/lib/versions/queries";
import { byteDeltaWords, compiledBytes, diffLines, versionName, versionRows } from "@/lib/versions/view";
import { VersionsView } from "./versions-view";

export const metadata: Metadata = { title: "Versions · 41Prompts", robots: { index: false, follow: false } };

/**
 * The Versions page: the history, what one version changed, restore, and A/B.
 *
 * ## The pair being compared lives in the URL
 *
 * `?a=&b=`. Two consequences worth having: a diff is a link somebody can send or bookmark, and the
 * page needs no client state to decide what it is showing — the list rows are links and the two
 * selects are a GET form, so both entry points drive the same thing.
 *
 * **An unknown id falls back to the default rather than 404ing.** A stale link is not a missing
 * prompt, and answering "not found" for a version that was pruned or belongs to another prompt would
 * be a worse answer than showing the newest two.
 *
 * ## Everything is computed here, on the server
 *
 * `diff()` is pure and the snapshots are already in hand, so there is nothing for a browser to do
 * that a server cannot do once. The client component below exists for the three buttons that call
 * server actions, and receives only plain data.
 */
export default async function VersionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ promptId: string }>;
  searchParams: Promise<{ a?: string; b?: string }>;
}) {
  const { promptId } = await params;
  const { a: aParam, b: bParam } = await searchParams;
  const session = await requireSession(`/app/pr/${promptId}/versions`);

  const found = await versionsPageFor(getDb(), promptId, session.user.id);
  // 404, not 403: a 403 would confirm the id is real.
  if (found === undefined) notFound();

  const { versions } = found;
  const byId = new Map(versions.map((version) => [version.id, version]));

  // Default: the two newest, oldest of the two on the left, which is the direction a history reads.
  const b = pick(bParam, byId) ?? versions[0];
  const a = pick(aParam, byId) ?? (b === versions[0] ? versions[1] : previousTo(versions, b));

  return (
    <main className="app-page app-page-wide">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/pr/${promptId}`}>{found.prompt.name}</a>
        </p>
        <h1>Versions</h1>
        <p className="app-state">Draft</p>
      </header>

      <VersionsView
        promptId={promptId}
        rows={versionRows(versions, found.rates, found.running)}
        selection={{
          a: a === undefined ? null : { id: a.id, name: versionName(a) },
          b: b === undefined ? null : { id: b.id, name: versionName(b), note: b.note ?? "" },
        }}
        comparison={compare(a, b)}
        inputSets={found.inputSets}
        truncated={found.truncated}
        shown={VERSIONS_SHOWN}
      />
    </main>
  );
}

function pick(id: string | undefined, byId: ReadonlyMap<string, VersionRow>): VersionRow | undefined {
  return id === undefined ? undefined : byId.get(id);
}

/** The version immediately before this one in the history — "what did this version change?". */
function previousTo(versions: readonly VersionRow[], version: VersionRow | undefined): VersionRow | undefined {
  if (version === undefined) return undefined;
  const index = versions.findIndex((row) => row.id === version.id);
  return index === -1 ? undefined : versions[index + 1];
}

/**
 * The diff between two versions, or the reason there is not one.
 *
 * Three outcomes and each is a sentence the page can say. `nothing` covers both "this prompt has one
 * version" and "there is nothing to compare it with", which are the same fact from the reader's side.
 * `unreadable` is `readSnapshot` refusing a shape it does not recognise — a real state, rendered as
 * itself rather than as a crash or, worse, as a diff against a guess.
 */
function compare(a: VersionRow | undefined, b: VersionRow | undefined) {
  if (a === undefined || b === undefined || a.id === b.id) return { kind: "nothing" } as const;

  const before = snapshotOf(a);
  const after = snapshotOf(b);
  if (before === undefined || after === undefined) {
    return { kind: "unreadable", which: before === undefined ? versionName(a) : versionName(b) } as const;
  }

  const result = diff(before, after);
  return {
    kind: "diff",
    lines: diffLines(result),
    bytes: byteDeltaWords(result, compiledBytes(before.compiledText)),
    empty: result.isEmpty,
  } as const;
}
