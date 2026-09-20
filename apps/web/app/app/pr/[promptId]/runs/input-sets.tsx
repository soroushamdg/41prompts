"use client";

import type { InputSetRow } from "@41prompts/db";
import { Button } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import {
  addInputSetByHandAction,
  duplicateInputSetAction,
  inputSetRowsAction,
  removeInputSetAction,
  startRunAction,
  startRunOnEveryProviderAction,
  updateInputSetAction,
  uploadInputSetAction,
} from "@/lib/runs/actions";
import { describeGridLimits, describeUploadLimits } from "@/lib/runs/limits";
import { ByHandGrid } from "./by-hand";

/**
 * Input sets: upload, list, remove, and the trigger.
 *
 * ## The surface refuses before the file does
 *
 * A prompt that declares no variables has nothing for a column to bind to (decision 1's third
 * consequence), so the file input is **not offered** and the page says why. Offering it and then
 * refusing every file would be technically the same answer and a much worse one — it would read as
 * a bug rather than as a thing to go and do.
 *
 * ## Nothing reloads
 *
 * Every write goes through a server action that revalidates, and this component asks the router to
 * re-render. It never calls `location.reload()`, which is the convenience that hid BUG-022 from
 * every test in two files (`PROCESS.md`).
 */
export function InputSets({
  promptId,
  sets,
  declarations,
  keyedProviders,
}: {
  promptId: string;
  sets: (InputSetRow & { runCount: number })[];
  declarations: { name: string; optional: boolean }[];
  /**
   * How many providers this person has an enabled key at (EPIC-042).
   *
   * The second trigger is offered only when the answer is two or more, because at one it would
   * create a single run under a label promising a comparison. The action refuses the same case in
   * words, so a person who gets here another way is still told why rather than being surprised.
   */
  keyedProviders: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);
  /**
   * Which by-hand surface is open: none, the new-set grid, or the grid editing one set.
   *
   * One piece of state rather than two booleans, because "adding" and "editing set X" are mutually
   * exclusive and two flags would let both be true.
   */
  const [editing, setEditing] = useState<
    { kind: "new" } | { kind: "set"; id: string; rows: string[][] } | undefined
  >();

  /**
   * Open the editor on an existing set.
   *
   * The rows are fetched here rather than carried by the listing: `rowCount` exists so a page of
   * sets does not read every rows blob, and editing is the one moment they are needed.
   */
  function openEditor(inputSetId: string) {
    run(async () => {
      const result = await inputSetRowsAction(promptId, inputSetId);
      if (result.ok) setEditing({ kind: "set", id: inputSetId, rows: result.rows ?? [] });
      return result;
    });
  }

  const canBind = declarations.length > 0;
  const required = declarations.filter((declaration) => !declaration.optional).map((d) => d.name);
  const optional = declarations.filter((declaration) => declaration.optional).map((d) => d.name);

  function run(action: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) {
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

  return (
    <section className="runs-panel" aria-label="Inputs">
      <h2>Inputs</h2>

      {message !== undefined && (
        <p className="app-form-message" role="alert">
          {message}
        </p>
      )}

      {!canBind ? (
        <p className="runs-note" data-testid="no-variables">
          This prompt declares no variables, so an input would have nothing to bind to. Declare one
          on the <a href={`/app/pr/${promptId}`}>Variables tab</a>, then either upload a file whose
          header names it or type the values in here.
        </p>
      ) : (
        <>
          <p className="runs-note">
            The header names this prompt&rsquo;s variables, and each row is one input. Required:{" "}
            <b>{required.length === 0 ? "none" : required.join(", ")}</b>
            {optional.length > 0 && (
              <>
                . Optional, and left out means the declared default is used:{" "}
                <b>{optional.join(", ")}</b>
              </>
            )}
            . {describeUploadLimits()}
          </p>

          <form
            ref={formRef}
            className="runs-upload"
            action={(form) =>
              run(
                () => uploadInputSetAction(promptId, form),
                () => formRef.current?.reset()
              )
            }
          >
            <label className="runs-file">
              <span>CSV file</span>
              <input type="file" name="file" accept=".csv,text/csv" required />
            </label>
            <Button type="submit" variant="primary" disabled={pending}>
              Upload
            </Button>
          </form>

          {/* EPIC-032a. Beside the upload rather than instead of it: a file is still the right
              answer for a hundred rows, and typing is the right answer for three. */}
          {editing?.kind === "new" ? (
            <ByHandGrid
              columns={declarations.map((declaration) => declaration.name)}
              initialName=""
              initialRows={[]}
              pending={pending}
              submitWord="Save inputs"
              onCancel={() => setEditing(undefined)}
              onSubmit={(input) =>
                run(
                  () => addInputSetByHandAction(promptId, input),
                  () => setEditing(undefined)
                )
              }
            />
          ) : (
            <p className="runs-note">
              Or{" "}
              <Button size="sm" disabled={pending} onClick={() => setEditing({ kind: "new" })}>
                add inputs by hand
              </Button>{" "}
              instead of a file. {describeGridLimits()}
            </p>
          )}
        </>
      )}

      {sets.length === 0 ? (
        canBind && (
          // EPIC-032a decision 5. Naming one of two mechanisms in the empty state teaches the wrong
          // one, and this sentence was the only place the product said how inputs get here.
          <p className="app-empty">
            No inputs yet. Upload a CSV, or add them by hand, to run this prompt against real cases.
          </p>
        )
      ) : (
        <ul className="runs-sets">
          {sets.map((set) => (
            <li key={set.id}>
              <span className="runs-set-name">{set.name}</span>
              <span className="runs-set-meta">
                {set.rowCount} {set.rowCount === 1 ? "input" : "inputs"} · {set.columns.join(", ")}
              </span>
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() =>
                  run(async () => {
                    const result = await startRunAction(promptId, set.id);
                    if (result.ok && result.id !== undefined) {
                      router.push(`/app/pr/${promptId}/runs/${result.id}`);
                    }
                    return result;
                  })
                }
              >
                Run {set.name}
              </Button>
              {keyedProviders > 1 && (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await startRunOnEveryProviderAction(promptId, set.id);
                      // The first of the set, because the matrix is on every one of their pages and
                      // landing on one of them is landing on the comparison.
                      if (result.ok && result.ids?.[0] !== undefined) {
                        router.push(`/app/pr/${promptId}/runs/${result.ids[0]}`);
                      }
                      return result;
                    })
                  }
                >
                  Run {set.name} on every provider
                </Button>
              )}
              {/* EPIC-032a decision 3. A set nothing has run is editable in place; one that has been
                  run is copied instead, because a `suite_run` keeps its inputs as a foreign key and
                  the run detail page reads them live. Editing in place would rewrite finished
                  history with nothing to notice it. The action refuses it too — this is the
                  courtesy, `updateInputSetAction` is the guarantee. */}
              {set.runCount === 0 ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => openEditor(set.id)}
                  data-testid={`edit-${set.id}`}
                >
                  Edit {set.name}
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = await duplicateInputSetAction(promptId, set.id);
                      // The copy is the thing to edit, and it is brand new, so its rows are the
                      // ones just read to make it — but going through `openEditor` keeps one path
                      // that loads rows, rather than two that can disagree.
                      if (result.ok && result.id !== undefined) openEditor(result.id);
                      return result;
                    })
                  }
                  data-testid={`duplicate-${set.id}`}
                >
                  Duplicate and edit {set.name}
                </Button>
              )}
              <Button size="sm" disabled={pending} onClick={() => run(() => removeInputSetAction(promptId, set.id))}>
                Remove {set.name}
              </Button>

              {editing?.kind === "set" && editing.id === set.id && (
                <ByHandGrid
                  columns={set.columns}
                  initialName={set.name}
                  initialRows={editing.rows}
                  pending={pending}
                  submitWord="Save changes"
                  onCancel={() => setEditing(undefined)}
                  onSubmit={(input) =>
                    run(
                      () => updateInputSetAction(promptId, set.id, input),
                      () => setEditing(undefined)
                    )
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
