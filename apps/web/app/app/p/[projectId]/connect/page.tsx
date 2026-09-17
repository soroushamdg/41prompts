import { isOptional } from "@41prompts/core";
import { liveForProject, variablesForPrompt } from "@41prompts/db";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPrompts } from "@/lib/canvas/queries";
import { generatedPromptsFile, identifiersFor, type ConnectPrompt } from "@/lib/connect/generate";
import { CONNECT_STEPS, TELEMETRY_NOTE } from "@/lib/connect/steps";
import { getDb } from "@/lib/db";
import { liveName } from "@/lib/deploy/view";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Connect · 41Prompts", robots: { index: false, follow: false } };

/**
 * The Connect page: how a program in somebody else's repository reads these prompts (EPIC-055).
 *
 * **TypeScript only.** `docs/roadmap.md`'s Goal line for this epic is "the delivery UI, TypeScript
 * path only"; Python is EPIC-054 and the CLI is EPIC-053. The mockup's three language tabs would be
 * two tabs producing code for packages nobody can install, which is worse than their absence.
 *
 * ## The steps are the README's and the file is this page's
 *
 * `lib/connect/steps.ts` holds the four snippets and `steps.test.ts` fails when one of them is not
 * in `packages/sdk-ts/README.md` — the README is what goes to npm, so it is the source (ruling 4).
 *
 * The generated `prompts.ts` is the opposite: **this page writes it**, from this project's own rows,
 * because every fact in it is already here and a preview of a file only a non-existent CLI could
 * produce would be a screenshot of a promise (ruling 3).
 */
export const dynamic = "force-dynamic";

export default async function ConnectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const session = await requireSession(`/app/p/${projectId}/connect`);

  const found = await listPrompts(getDb(), projectId, session.user.id);
  // 404, not 403: a 403 would confirm the id is real.
  if (found === undefined) notFound();

  // What is Live for each prompt, in one query rather than one per row.
  const live = await liveForProject(getDb(), projectId);
  const liveByPrompt = new Map(live.map((row) => [row.id, row.live]));

  const prompts: ConnectPrompt[] = await Promise.all(
    found.prompts.map(async (prompt) => ({
      id: prompt.id,
      name: prompt.name,
      variables: (await variablesForPrompt(getDb(), prompt.id)).map((declaration) => ({
        name: declaration.name,
        optional: isOptional(declaration),
      })),
    })),
  );

  const identifiers = identifiersFor(prompts);

  return (
    <main className="app-page app-page-wide">
      <header className="app-pagehead">
        <p className="app-crumb">
          <a href={`/app/p/${projectId}`}>{found.project.name}</a>
        </p>
        <h1>Connect</h1>
        <p className="app-state">TypeScript</p>
      </header>

      <ol className="connect-steps">
        {CONNECT_STEPS.map((step, index) => (
          <li className="connect-step" key={step.slug} id={`step-${step.slug}`}>
            <span className="connect-step-n" aria-hidden="true">
              {index + 1}
            </span>
            <div className="connect-step-body">
              <h3>{step.title}</h3>
              <p className="connect-step-says">{step.says}</p>
              <pre className="connect-code">
                <code>{step.code}</code>
              </pre>
            </div>
          </li>
        ))}
      </ol>

      <div className="connect-two">
        <section className="connect-card" aria-label="A file for your project">
          <div className="connect-cardhead">
            <h2>prompts.ts</h2>
            {/* Ruling 3: this says what it is. It does not credit a tool that does not exist. */}
            <p>Written from this project&rsquo;s prompts. Copy it in, or write your own — it is only a wrapper.</p>
          </div>
          <pre className="connect-code">
            <code data-testid="generated-file">{generatedPromptsFile(prompts)}</code>
          </pre>
        </section>

        <section className="connect-card" aria-label="Prompts in this project">
          <div className="connect-cardhead">
            <h2>Prompts in this project</h2>
            <p>The id is what `resolve` takes. The inputs are what it needs.</p>
          </div>
          <div className="connect-cardbody">
            {prompts.length === 0 ? (
              <p className="connect-prompts-none">
                No prompts yet. <a href={`/app/p/${projectId}`}>Create one</a> and it will be here.
              </p>
            ) : (
              <table className="connect-prompts">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Id</th>
                    <th scope="col">Inputs</th>
                    <th scope="col">Live</th>
                  </tr>
                </thead>
                <tbody>
                  {prompts.map((prompt) => {
                    const event = liveByPrompt.get(prompt.id);
                    return (
                      <tr key={prompt.id}>
                        <td>
                          <code>{identifiers.get(prompt.id)}</code>
                        </td>
                        <td>
                          <code>{prompt.id}</code>
                        </td>
                        <td>
                          {prompt.variables.length === 0 ? (
                            <span className="connect-prompts-none">none</span>
                          ) : (
                            prompt.variables
                              .map((variable) => (variable.optional ? `${variable.name}?` : variable.name))
                              .join(", ")
                          )}
                        </td>
                        <td>
                          {event === undefined ? (
                            <span className="connect-prompts-none">not published</span>
                          ) : (
                            <code>{liveName(event.versionN)}</code>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>

      <section className="connect-telemetry" aria-label={TELEMETRY_NOTE.title}>
        <h2>{TELEMETRY_NOTE.title}</h2>
        <p>{TELEMETRY_NOTE.says}</p>
        <p>{TELEMETRY_NOTE.onSays}</p>
        <pre className="connect-code">
          <code>{TELEMETRY_NOTE.header}</code>
        </pre>
      </section>

      {/* Ruling 2, again — the same absence stated on the page where somebody would go looking for
          it after connecting an application. */}
      <section className="runs-panel" aria-label="Apps calling these prompts">
        <h2>Which applications are resolving these</h2>
        <p className="runs-note">
          Not yet. It is read from the access log of the network that serves the builds, and that
          network does not exist — so there is nothing to count rather than nothing happening. No
          application is ever asked to report itself, and none ever will be.
        </p>
      </section>
    </main>
  );
}
