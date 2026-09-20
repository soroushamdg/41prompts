import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { canvasForOwner, compiledForBloks } from "@/lib/canvas/queries";
import { compiledView } from "@/lib/canvas/compiled-view";
import { getDb } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { variablesViewFor } from "@/lib/variables/queries";
import {
  PROVIDERS,
  providerKeyMetadata,
  variablesForPrompt,
  type ProviderName
} from "@41prompts/db";
import { ChecksTab } from "./checks-tab";
import { Editor } from "./editor";
import { ProvidersTab } from "./providers-tab";
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

  // Which providers this account can actually call. **Metadata only** — `apps/web` never opens an
  // envelope (threat model row `043a`), and this needs nothing beyond whether a row exists.
  const stored = await providerKeyMetadata(getDb(), session.user.id);
  const keyed = Object.fromEntries(
    PROVIDERS.map((provider) => [provider, stored.some((key) => key.provider === provider)])
  ) as Record<ProviderName, boolean>;

  // EPIC-055 C14 put `Draft vN · Live vM` here; **EPIC-023 moved it into the top bar**, where it
  // is on every screen rather than only this one — and where Runs, Versions and Deploy, which are
  // the pages you most want it on, now show it too. `lib/app-shell/names.ts` reads it, through the
  // same `versionName()` and `liveName()` this file used, so there is still one spelling of it.

  return (
    <main className="app-page">
      <header className="app-pagehead">
        <h1>{found.prompt.name}</h1>
        {/* The mockup's page head carries a run action. It is a link rather than a button because
            it goes somewhere — the runs page, where an input set is chosen — and a button that
            navigates is a link wearing a costume.

            Versions sits beside it for a blunter reason: a page nothing links to is a page nobody
            finds, which is the whole content of the `/app` dead end (`PROCESS.md`). */}
        <span className="app-pagehead-actions">
          <a className="btn btn-sm app-pagehead-action" href={`/app/pr/${promptId}/versions`}>
            Versions
          </a>
          <a className="btn btn-sm app-pagehead-action" href={`/app/pr/${promptId}/runs`}>
            Run
          </a>
          {/* EPIC-055. The primary action on a prompt that has been written and run is to put it in
              front of an application; before this epic there was no link to the page that does it. */}
          <a className="btn btn-pri btn-sm app-pagehead-action" href={`/app/pr/${promptId}/deploy`}>
            Publish…
          </a>
        </span>
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
        checks={<ChecksTab checks={compiled.checks} />}
        providers={<ProvidersTab keyed={keyed} />}
      />
    </main>
  );
}
