"use client";

import type { InputSetRow } from "@41prompts/db";
import { Button } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { removeInputSetAction, startRunAction, uploadInputSetAction } from "@/lib/runs/actions";
import { describeUploadLimits } from "@/lib/runs/limits";

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
}: {
  promptId: string;
  sets: InputSetRow[];
  declarations: { name: string; optional: boolean }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const formRef = useRef<HTMLFormElement>(null);

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
          This prompt declares no variables, so a column in a CSV would have nothing to bind to.
          Declare one on the <a href={`/app/pr/${promptId}`}>Variables tab</a>, then upload a file
          whose header names it.
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
        </>
      )}

      {sets.length === 0 ? (
        canBind && <p className="app-empty">No inputs yet. Upload a CSV to run this prompt against real cases.</p>
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
              <Button size="sm" disabled={pending} onClick={() => run(() => removeInputSetAction(promptId, set.id))}>
                Remove {set.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
