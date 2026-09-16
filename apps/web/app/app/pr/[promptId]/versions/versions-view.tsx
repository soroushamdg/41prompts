"use client";

import { Button, VersionsIllustration } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DiffLineView, VersionRowView } from "@/lib/versions/view";
import { abAction, restoreVersionAction, setVersionNoteAction } from "@/lib/versions/actions";

/**
 * The Versions page's body: the history on the left, the diff on the right.
 *
 * ## Why this is a client component at all
 *
 * Three things call server actions — restore, A/B and a note — and each needs a pending state and a
 * message. Everything else on the page is a link or a GET form and is rendered on the server, which
 * is why this receives finished view data rather than rows to interpret.
 *
 * ## Nothing reloads
 *
 * Every write revalidates on the server and this asks the router to re-render. `location.reload()`
 * is the convenience that hid BUG-022 from every test in two files (`PROCESS.md`), and no helper in
 * the e2e suite reloads either, so a missing `revalidatePath` fails a test instead of hiding.
 */

export interface Comparison {
  kind: "diff" | "nothing" | "unreadable";
  lines?: DiffLineView[];
  bytes?: string;
  empty?: boolean;
  which?: string;
}

export function VersionsView({
  promptId,
  rows,
  selection,
  comparison,
  inputSets,
  truncated,
  shown,
}: {
  promptId: string;
  rows: VersionRowView[];
  selection: {
    a: { id: string; name: string } | null;
    b: { id: string; name: string; note: string } | null;
  };
  comparison: Comparison;
  inputSets: { id: string; name: string; rowCount: number }[];
  truncated: boolean;
  shown: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [chosenSet, setChosenSet] = useState(inputSets[0]?.id ?? "");

  // A set can be removed on the Runs page while this one is open, and a `<select>` holding an id
  // that is no longer an option renders as blank and submits nothing. Deriving the effective value
  // rather than trusting the state is the fix; resetting it in an effect would be a render behind.
  const inputSetId = inputSets.some((set) => set.id === chosenSet) ? chosenSet : (inputSets[0]?.id ?? "");

  function act(action: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
    setMessage(undefined);
    start(async () => {
      const result = await action();
      if (result.ok) {
        after?.();
        router.refresh();
      } else {
        setMessage(result.message ?? "That did not work.");
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="app-empty versions-empty">
        <VersionsIllustration />
        <p>No versions yet. Write a blok on the canvas and the first one appears here.</p>
      </div>
    );
  }

  const canAb = selection.a !== null && selection.b !== null && selection.a.id !== selection.b.id;

  return (
    <>
      <div className="versions-actions">
        {inputSets.length === 0 ? (
          <p className="versions-note">
            To compare two versions on the same inputs, upload a CSV on the{" "}
            <a href={`/app/pr/${promptId}/runs`}>Runs page</a> first.
          </p>
        ) : (
          <>
            <label className="versions-field">
              <span>Inputs</span>
              <select
                value={inputSetId}
                onChange={(event) => setChosenSet(event.target.value)}
                disabled={pending}
              >
                {inputSets.map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name} · {set.rowCount} {set.rowCount === 1 ? "input" : "inputs"}
                  </option>
                ))}
              </select>
            </label>
            <Button
              size="sm"
              variant="primary"
              disabled={pending || !canAb || inputSetId === ""}
              onClick={() =>
                act(async () => {
                  const result = await abAction(promptId, selection.a!.id, selection.b!.id, inputSetId);
                  if (result.ok && result.runIds !== undefined) {
                    // Both runs are on the Runs page, each naming the other. The answer to "which is
                    // better" arrives in this page's pass-rate column when they finish.
                    router.push(`/app/pr/${promptId}/runs`);
                  }
                  return result;
                })
              }
            >
              {canAb ? `A/B ${selection.a!.name} vs ${selection.b!.name}` : "A/B two versions"}
            </Button>
          </>
        )}
      </div>

      {message !== undefined && (
        <p className="app-form-message" role="alert">
          {message}
        </p>
      )}

      <div className="versions-row">
        <section className="versions-list-panel" aria-label="History">
          <h2>History</h2>
          <ul className="versions-list">
            {rows.map((row) => {
              const inComparison = row.id === selection.a?.id || row.id === selection.b?.id;
              return (
                <li key={row.id} data-open={row.open ? "true" : undefined}>
                  {/* Clicking a version asks "what changed in this one" — it becomes the right-hand
                      side and the version before it becomes the left. The two selects below reach
                      any other pair; both drive the same URL. */}
                  <a
                    className="versions-item"
                    href={`/app/pr/${promptId}/versions?a=${previousOf(rows, row.id) ?? ""}&b=${row.id}`}
                    {...(inComparison ? { "aria-current": "true" as const } : {})}
                  >
                    <span className="versions-item-name">{row.name}</span>
                    <span className="versions-item-when">{row.when}</span>
                    {row.note !== null && <span className="versions-item-note">{row.note}</span>}
                    <span className="versions-item-rate">{row.passRate}</span>
                    <span className="versions-item-state">{row.openNote}</span>
                  </a>
                  {!row.open && (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => act(() => restoreVersionAction(promptId, row.id))}
                    >
                      Restore {row.name}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {truncated && (
            <p className="versions-note">
              Showing the {shown} most recent. Nothing removes older ones; they are still stored.
            </p>
          )}
        </section>

        <section className="versions-diff-panel" aria-label="What changed">
          <h2>
            {selection.a !== null && selection.b !== null && selection.a.id !== selection.b.id
              ? `${selection.a.name} → ${selection.b.name}`
              : "What changed"}
          </h2>

          {/* **Keyed on the pair**, so choosing a different version re-seeds both `defaultValue`s.
              Without the key this is a client component whose uncontrolled inputs keep whatever was
              in them when it first mounted, while the server re-renders around them — the stale
              client state that was BUG-022, arriving through a form instead of a panel. */}
          <ComparePicker
            key={`${selection.a?.id ?? ""}-${selection.b?.id ?? ""}`}
            promptId={promptId}
            rows={rows}
            selection={selection}
          />

          {comparison.kind === "nothing" && (
            <p className="app-empty" data-testid="no-diff">
              {rows.length === 1
                ? "There is only one version so far, so there is nothing to compare it with. Edit a blok and run the prompt, and the next one appears here."
                : "Pick two different versions to see what changed between them."}
            </p>
          )}

          {comparison.kind === "unreadable" && (
            <p className="app-empty" data-testid="unreadable-diff">
              {comparison.which}&rsquo;s blok set cannot be read, so there is nothing honest to show
              here.
            </p>
          )}

          {comparison.kind === "diff" && (
            <>
              {comparison.empty === true ? (
                <p className="app-empty" data-testid="empty-diff">
                  Nothing changed between these two. The compiled prompt is identical.
                </p>
              ) : (
                <ul className="versions-diff">
                  {comparison.lines?.map((line, index) => (
                    <li key={`${line.blokId}-${line.verb}-${index}`} data-verb={line.verb}>
                      {/* The verb is a word, never only a colour — rule 10 reserves green, red and
                          amber for pass, fail and drift, and none of these four is any of those. */}
                      <span className="versions-diff-verb">{line.verb}</span>
                      <span className="versions-diff-what">{line.what}</span>
                      <span className="versions-diff-detail">{line.detail}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="versions-bytes">
                <span>Compiled</span> {comparison.bytes}
              </p>
            </>
          )}

          {selection.b !== null && (
            // Keyed for the same reason as the picker: the field holds one version's note, and a
            // field that kept the previous version's words would let somebody save them onto this
            // one without ever seeing what they had overwritten.
            <NoteForm
              key={selection.b.id}
              version={selection.b}
              pending={pending}
              onSave={(value) => act(() => setVersionNoteAction(promptId, selection.b!.id, value))}
            />
          )}
        </section>
      </div>
    </>
  );
}

/** The version listed after this one — the history is newest first, so that is the older neighbour. */
function previousOf(rows: readonly VersionRowView[], id: string): string | undefined {
  const index = rows.findIndex((row) => row.id === id);
  return index === -1 ? undefined : rows[index + 1]?.id;
}

/** The two selects, as a GET form. A navigation, not a write — so no action and no pending state. */
function ComparePicker({
  promptId,
  rows,
  selection,
}: {
  promptId: string;
  rows: VersionRowView[];
  selection: { a: { id: string; name: string } | null; b: { id: string; name: string } | null };
}) {
  return (
    <form className="versions-compare" method="get" action={`/app/pr/${promptId}/versions`}>
      <label className="versions-field">
        <span>Compare</span>
        <select name="a" defaultValue={selection.a?.id ?? ""}>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <label className="versions-field">
        <span>with</span>
        <select name="b" defaultValue={selection.b?.id ?? ""}>
          {rows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" type="submit">
        Show
      </Button>
    </form>
  );
}

/** A person's own words about one version. Allowed on a pinned one — `setVersionNote` says why. */
function NoteForm({
  version,
  pending,
  onSave,
}: {
  version: { id: string; name: string; note: string };
  pending: boolean;
  onSave: (note: string) => void;
}) {
  const [note, setNote] = useState(version.note);
  return (
    <form className="versions-note-form" action={() => onSave(note)}>
      <label className="versions-field versions-field-wide">
        <span>Note on {version.name}</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Why you made this change"
          maxLength={280}
          disabled={pending}
        />
      </label>
      <Button size="sm" type="submit" disabled={pending}>
        Save note
      </Button>
    </form>
  );
}
