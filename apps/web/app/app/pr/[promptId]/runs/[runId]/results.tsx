"use client";

import { BlokCard, Button, Meter, StatusIcon, Tag, Textarea } from "@41prompts/ui";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addConstraintFromFailureAction } from "@/lib/runs/actions";
import { evidenceSentence, highlightParts, type CheckRowView } from "@/lib/runs/view";

/**
 * Results **by check** (decision 2), each with its owning blok, a meter, and an icon beside the
 * colour.
 *
 * ## Why an icon and not only a colour
 *
 * `CLAUDE.md` rule 10: green, red and amber mean pass, fail and drift, and **pass/fail is never
 * shown by colour alone**. Every row carries a glyph and the counts in text, so the same fact is
 * readable three ways. Amber appears nowhere on this page, because nothing here is drift.
 *
 * ## A check nothing could grade is neither
 *
 * It gets no colour and no rate — painting it green would claim evidence that does not exist and
 * painting it red would fail a prompt for being simple. It says in words why it could not be
 * checked.
 */
export function Results({
  promptId,
  rows,
  columns,
  inputRows,
  outputs,
}: {
  promptId: string;
  rows: CheckRowView[];
  columns: string[];
  inputRows: string[][];
  outputs: Record<string, string | null>;
}) {
  const [open, setOpen] = useState<string | undefined>();

  if (rows.length === 0) {
    return (
      <section className="runs-panel" aria-label="Results by check">
        <h2>Results by check</h2>
        <p className="app-empty">
          This prompt has no checks, so this run measured cost and latency and verified nothing. Add
          an expected blok on the canvas to change that.
        </p>
      </section>
    );
  }

  return (
    <section className="runs-panel" aria-label="Results by check">
      <h2>Results by check</h2>

      <ul className="runs-checks">
        {rows.map((row) => {
          const isOpen = open === row.suiteCheckId;
          return (
            <li key={row.suiteCheckId} data-status={row.status ?? "not-checked"}>
              <div className="runs-check">
                <span className="runs-check-outcome">
                  {row.status !== undefined && <StatusIcon status={row.status} />}
                  <span className="runs-check-counts">
                    {row.status === undefined
                      ? "Not checked"
                      : `${row.passed} of ${row.passed + row.failed} passed`}
                  </span>
                </span>

                <span className="runs-check-what">
                  <b>{row.phrase}</b>
                  <span className="runs-check-blok">{row.blokText}</span>
                </span>

                <Meter
                  className="runs-check-meter"
                  value={row.meterValue}
                  status={row.status}
                  description={
                    row.status === undefined
                      ? "Nothing could be graded for this check"
                      : `${row.passed} of ${row.passed + row.failed} inputs passed`
                  }
                />

                {row.firstFailure !== undefined && (
                  <Button
                    size="sm"
                    aria-expanded={isOpen}
                    onClick={() => setOpen(isOpen ? undefined : row.suiteCheckId)}
                  >
                    {isOpen ? "Hide failure" : "Show failure"}
                  </Button>
                )}
              </div>

              {isOpen && row.firstFailure !== undefined && (
                <FailureDetail
                  promptId={promptId}
                  row={row}
                  columns={columns}
                  input={inputRows[row.firstFailure.inputIndex] ?? []}
                  output={row.firstFailure.runId === null ? null : (outputs[row.firstFailure.runId] ?? null)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * One failure, in full: the input, the output with the failing region marked, and the one blok this
 * came from.
 *
 * **Exactly one blok, and it is read rather than computed.** `CheckResult.blokId` is one by
 * construction in `compile()` and asserted in core's `grade.test.ts`; if this file found itself
 * deciding which blok a failure belonged to, it would have taken a wrong turn (note 8).
 */
function FailureDetail({
  promptId,
  row,
  columns,
  input,
  output,
}: {
  promptId: string;
  row: CheckRowView;
  columns: string[];
  input: string[];
  output: string | null;
}) {
  const failure = row.firstFailure!;
  const said = evidenceSentence(failure.evidence);
  const parts = output === null ? undefined : highlightParts(output, failure.evidence);

  return (
    <div className="runs-failure" data-testid="failure-detail">
      <div className="runs-failure-output">
        <h3>Input {failure.inputIndex + 1}</h3>
        <dl className="runs-input">
          {columns.map((column, index) => (
            <div key={column}>
              <dt>{column}</dt>
              <dd>{input[index] ?? ""}</dd>
            </div>
          ))}
        </dl>

        <h3>What the model answered</h3>
        {parts === undefined ? (
          <p className="runs-note">
            The stored answer is no longer here. Raw provider payloads are kept for twelve months and
            then deleted, so an older run keeps its verdict and loses its transcript.
          </p>
        ) : (
          <p className="runs-output" data-testid="model-output">
            {parts.match === "" ? (
              output
            ) : (
              <>
                {parts.before}
                <mark className="runs-highlight" data-testid="failing-region">
                  {parts.match}
                </mark>
                {parts.after}
              </>
            )}
          </p>
        )}
        {said !== undefined && (
          /* `data-judged` when this came from a model rather than from a measurement. The four
             deterministic evidences are facts a reader can re-derive from the output above; a
             judgement is testimony, and it is marked so it is never read as the same kind of
             thing. The attribution is in the sentence itself (`evidenceSentence`). */
          <p
            className="runs-evidence"
            data-testid="evidence"
            {...(failure.evidence?.kind === "judgement" ? { "data-judged": "true" } : {})}
          >
            {said}
          </p>
        )}
      </div>

      <div className="runs-failure-blok">
        <h3>The blok this came from</h3>
        {/* `as="div"`: this card is not itself a control, and a button containing one is
            `nested-interactive`, which axe flags and screen readers genuinely mishandle. */}
        <BlokCard
          as="div"
          kind={row.blokKind}
          kindTag={<Tag>{row.blokKind}</Tag>}
          meta={
            <>
              <span>{row.phrase}</span>
              <span>
                {row.failed} failing {row.failed === 1 ? "input" : "inputs"}
              </span>
            </>
          }
        >
          {row.blokText}
        </BlokCard>
        <CreateConstraint promptId={promptId} suggested={row.blokText} />
      </div>
    </div>
  );
}

/**
 * "Create constraint from this failure" — **a preview first, always** (decision 6).
 *
 * The preview is the text that would be added, and it is editable, because the words start as the
 * author's own: the expected blok's verbatim text, copied rather than paraphrased. Nothing here
 * composes a sentence on somebody's behalf (`CLAUDE.md` rule 3's reasoning).
 *
 * Confirming **adds a new blok and edits none**. That is structural rather than a promise: the
 * action calls `addBlok`, which is one INSERT that touches no other row.
 */
function CreateConstraint({ promptId, suggested }: { promptId: string; suggested: string }) {
  const router = useRouter();
  const [previewing, setPreviewing] = useState(false);
  const [text, setText] = useState(suggested);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | undefined>();

  if (!previewing) {
    return (
      <Button variant="primary" className="runs-create" onClick={() => setPreviewing(true)}>
        Create constraint from this failure
      </Button>
    );
  }

  return (
    <div className="runs-preview" data-testid="constraint-preview">
      <p className="runs-note">
        This adds a <b>new</b> constraint blok with the text below. Nothing already on the canvas is
        changed.
      </p>
      <Textarea
        aria-label="Constraint text"
        value={text}
        rows={4}
        onChange={(event) => setText(event.target.value)}
      />
      {message !== undefined && (
        <p className="app-form-message" role="alert">
          {message}
        </p>
      )}
      <div className="runs-preview-actions">
        <Button
          variant="primary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const result = await addConstraintFromFailureAction(promptId, text);
              if (result.ok) {
                setPreviewing(false);
                router.refresh();
              } else {
                setMessage(result.message ?? "That did not work.");
              }
            })
          }
        >
          Add constraint blok
        </Button>
        <Button
          disabled={pending}
          onClick={() => {
            setPreviewing(false);
            setText(suggested);
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
