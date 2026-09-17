"use client";

import { Button, Input, StatusIcon } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createKeyAction, revokeKeyAction, rotateKeyAction, type KeyActionResult } from "@/lib/keys/actions";

/**
 * One section per project: mint a key, see the ones you have, rotate or revoke them.
 *
 * ## The plaintext lives in this component's state and nowhere else
 *
 * A key is returned once by the action that made it. It is held here so a person can copy it, and it
 * is gone on the next render of the page — there is nothing on the server that could put it back.
 * The panel says that in as many words rather than leaving somebody to find out by reloading.
 *
 * ## Revoked keys are listed, not hidden
 *
 * Rotation writes two rows precisely so that "which key was in the field on Tuesday" has an answer
 * (ruling 6); hiding the answer would pay the cost of keeping it and get nothing back.
 */
export function ApiKeys({ projects }: { projects: ProjectView[] }) {
  if (projects.length === 0) {
    return (
      <section className="runs-panel" aria-label="API keys">
        <h2>No projects yet</h2>
        <p className="runs-note">
          A key resolves the prompts in one project, so there is nothing to make a key for until there
          is a project. <a href="/app/projects">Make one</a> and this page will have something on it.
        </p>
      </section>
    );
  }

  return (
    <>
      <section className="runs-panel" aria-label="What a key is for">
        <h2>What a key is for</h2>
        <p className="runs-note">
          A program uses a key to read what is Live. Put it in <code>FORTYONE_API_KEY</code> and the
          SDK finds it. A live key and a test key both resolve the same thing; which one was used is
          recorded, so a build server is never counted as an application.
        </p>
      </section>
      {projects.map((project) => (
        <ProjectKeys key={project.id} project={project} />
      ))}
    </>
  );
}

function ProjectKeys({ project }: { project: ProjectView }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [result, setResult] = useState<KeyActionResult | undefined>();
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState("live");

  const run = (action: () => Promise<KeyActionResult>) =>
    start(async () => {
      const outcome = await action();
      setResult(outcome);
      if (outcome.ok) {
        setName("");
        router.refresh();
      }
    });

  return (
    <section className="keys-project" aria-label={`Keys for ${project.name}`}>
      <div className="keys-projecthead">
        <h2>{project.name}</h2>
        <code className="keys-projectid">{project.id}</code>
      </div>

      {/* Shown once. There is no second chance and the copy says so. */}
      {result?.plaintext !== undefined && (
        <div className="keys-minted" role="status">
          <p className="keys-minted-says">
            <StatusIcon status="pass" /> Copy it now. This is the only time it is shown.
          </p>
          <code className="keys-plaintext" data-testid="minted-key">
            {result.plaintext}
          </code>
          {result.message !== undefined && <p className="keys-minted-note">{result.message}</p>}
        </div>
      )}
      {result !== undefined && result.plaintext === undefined && (
        <p className={result.ok ? "keys-said" : "keys-said keys-said-refused"} role="status">
          {result.message}
        </p>
      )}

      <form
        className="keys-new"
        onSubmit={(event) => {
          event.preventDefault();
          run(() => createKeyAction(project.id, name, environment));
        }}
      >
        <label className="keys-field">
          <span>Name</span>
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="api-gateway"
            aria-label={`Name for a new key in ${project.name}`}
          />
        </label>
        <label className="keys-field">
          <span>Environment</span>
          <select
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            aria-label={`Environment for a new key in ${project.name}`}
          >
            <option value="live">Live key</option>
            <option value="test">Test key</option>
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={pending}>
          New key
        </Button>
      </form>

      {/* `result?.plaintext === undefined` is the guard, and it is not cosmetic: minting sets the
          panel above immediately and `router.refresh()` lands a moment later, so without it the page
          spends that moment showing a key and saying "No keys yet" directly underneath it. The drive
          screenshotted exactly that. */}
      {project.live.length === 0 && project.revoked.length === 0 && result?.plaintext === undefined ? (
        <p className="runs-note">No keys yet. The first one is what lets a program read this project.</p>
      ) : (
        <ul className="keys-rows">
          {project.live.map((key) => (
            <KeyRow
              key={key.id}
              entry={key}
              pending={pending}
              onRotate={() => run(() => rotateKeyAction(project.id, key.id))}
              onRevoke={() => run(() => revokeKeyAction(project.id, key.id))}
            />
          ))}
          {project.revoked.map((key) => (
            <KeyRow key={key.id} entry={key} pending={pending} />
          ))}
        </ul>
      )}
    </section>
  );
}

function KeyRow({
  entry,
  pending,
  onRotate,
  onRevoke,
}: {
  entry: KeyView;
  pending: boolean;
  onRotate?: () => void;
  onRevoke?: () => void;
}) {
  const revoked = entry.revokedAt !== null;
  return (
    <li className={revoked ? "keys-row keys-row-revoked" : "keys-row"}>
      <span className="keys-row-what">
        <b>{entry.name}</b>
        <code>
          41p_{entry.environment}_…{entry.lastFour}
        </code>
      </span>
      <span className="keys-row-when">
        <span>{entry.environment === "live" ? "Live key" : "Test key"}</span>
        <span>Made {onDay(entry.createdAt)}</span>
        <span>{entry.lastUsedAt === null ? "Never used" : `Last used ${onDay(entry.lastUsedAt)}`}</span>
        {revoked && <span className="keys-row-stopped">Stopped {onDay(entry.revokedAt!)}</span>}
      </span>
      {!revoked && (
        <span className="keys-row-actions">
          <Button size="sm" onClick={onRotate} disabled={pending}>
            Rotate
          </Button>
          <Button size="sm" variant="ghost" onClick={onRevoke} disabled={pending}>
            Revoke
          </Button>
        </span>
      )}
    </li>
  );
}

/** A date a person reads. Never a time: nothing here is decided by the hour. */
function onDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export interface KeyView {
  id: string;
  name: string;
  lastFour: string;
  environment: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ProjectView {
  id: string;
  name: string;
  live: KeyView[];
  revoked: KeyView[];
}
