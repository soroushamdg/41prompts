"use client";

import { isOptional, type VariableIssue, type VariableOccurrence } from "@41prompts/core";
import type { VariableRow } from "@41prompts/db";
import { Button, Input } from "@41prompts/ui";
import { useState, useTransition } from "react";
import { declare, rename, setDetails, undeclare } from "@/lib/variables/actions";
import { previewText } from "@/lib/variables/preview";

/**
 * The Variables tab.
 *
 * Two lists and a preview. The first list is **what disagrees** — a name used and never declared, or
 * declared and never used — and it comes first because one of those two ships a literal `{{name}}`
 * to somebody's customer. The second is what the prompt declares.
 *
 * **The word "schema" appears nowhere in this file's copy** (ADR-003). It is the right word for the
 * thing and the wrong word for the reader.
 */
export function VariablesTab({
  promptId,
  declarations,
  issues,
  occurrences,
  compiledText,
}: {
  promptId: string;
  declarations: VariableRow[];
  issues: readonly VariableIssue[];
  occurrences: readonly VariableOccurrence[];
  compiledText: string;
}) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | undefined>();
  const [newName, setNewName] = useState("");
  const [showPreview, setShowPreview] = useState(false);

  const declared = declarations.map((d) => ({ ...d, optional: isOptional(d) }));
  const preview = previewText(compiledText, declarations);
  const previewChangesSomething = preview !== compiledText;

  function run(action: () => Promise<{ ok: boolean; message?: string }>) {
    setMessage(undefined);
    start(async () => {
      const result = await action();
      if (!result.ok) setMessage(result.message ?? "That did not work.");
    });
  }

  const undeclaredUses = issues.filter((i) => i.kind === "used_but_not_declared");
  const unusedDeclarations = issues.filter((i) => i.kind === "declared_but_not_used");

  return (
    <section className="variables" aria-label="Variables">
      {message !== undefined && (
        <p className="app-form-message" role="status">
          {message}
        </p>
      )}

      {undeclaredUses.length > 0 && (
        <section className="variables-issues" aria-label="Used but not declared">
          <h3>Used but not declared</h3>
          <p className="variables-note">
            This prompt sends these to the model exactly as written, braces and all, because nothing
            says what they stand for.
          </p>
          <ul className="variables-list">
            {undeclaredUses.map((issue) => (
              <li key={issue.name}>
                <code className="variables-name">{issue.name}</code>
                <span className="variables-where">{whereUsed(issue.occurrences)}</span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={pending}
                  onClick={() => run(() => declare(promptId, issue.name, null, null))}
                >
                  Declare {issue.name}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unusedDeclarations.length > 0 && (
        <section className="variables-issues" aria-label="Declared but never used">
          <h3>Declared but never used</h3>
          <p className="variables-note">
            Nothing in the prompt refers to these. They are harmless; they are also a promise to
            whoever calls this prompt that they need to supply something that has no effect.
          </p>
          <ul className="variables-list">
            {unusedDeclarations.map((issue) => (
              <li key={issue.name}>
                <code className="variables-name">{issue.name}</code>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Declared variables">
        <h3>Declared</h3>
        {declared.length === 0 ? (
          <p className="app-empty">
            Nothing declared yet. Write <code>{"{{a_name}}"}</code> in a blok and it will appear above.
          </p>
        ) : (
          <ul className="variables-declared">
            {declared.map((variable) => (
              <DeclaredVariable
                key={variable.id}
                promptId={promptId}
                variable={variable}
                used={occurrences.some((o) => o.name === variable.name)}
                pending={pending}
                run={run}
              />
            ))}
          </ul>
        )}

        <form
          className="variables-add"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newName.trim();
            if (name === "") return;
            run(async () => {
              const result = await declare(promptId, name, null, null);
              if (result.ok) setNewName("");
              return result;
            });
          }}
        >
          <label className="field" htmlFor="variables-new-name">
            Declare a variable
          </label>
          <Input
            id="variables-new-name"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="customer_name"
          />
          <Button type="submit" size="sm" disabled={pending || newName.trim() === ""}>
            Declare
          </Button>
        </form>
      </section>

      <section aria-label="Preview">
        <h3>Preview</h3>
        <p className="variables-note">
          The compiled prompt with each default written in. This is for reading: it changes nothing
          that is sent, saved or published.
        </p>
        {previewChangesSomething ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowPreview((on) => !on)} aria-expanded={showPreview}>
              {showPreview ? "Hide preview" : "Show preview"}
            </Button>
            {showPreview && <pre className="variables-preview">{preview}</pre>}
          </>
        ) : (
          <p className="app-empty">
            Nothing to preview: no variable in this prompt has a default to stand in for it.
          </p>
        )}
      </section>
    </section>
  );
}

function DeclaredVariable({
  promptId,
  variable,
  used,
  pending,
  run,
}: {
  promptId: string;
  variable: VariableRow & { optional: boolean };
  used: boolean;
  pending: boolean;
  run: (action: () => Promise<{ ok: boolean; message?: string }>) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(variable.name);
  const [defaultValue, setDefaultValue] = useState(variable.defaultValue ?? "");
  const [hasDefault, setHasDefault] = useState(variable.defaultValue !== null);
  const [description, setDescription] = useState(variable.description ?? "");

  return (
    <li className="variables-declared-item">
      <div className="variables-declared-head">
        <code className="variables-name">{variable.name}</code>
        <span className="variables-required">{variable.optional ? "Optional" : "Required"}</span>
        {!used && <span className="variables-where">not used</span>}
      </div>

      {renaming ? (
        <form
          className="variables-rename"
          onSubmit={(event) => {
            event.preventDefault();
            run(async () => {
              const result = await rename(promptId, variable.name, draftName.trim());
              if (result.ok) setRenaming(false);
              return result;
            });
          }}
        >
          <label className="field" htmlFor={`rename-${variable.id}`}>
            New name for {variable.name}
          </label>
          <Input
            id={`rename-${variable.id}`}
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            Rename everywhere
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="variables-declared-controls">
          <Button size="sm" variant="ghost" onClick={() => setRenaming(true)}>
            Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => undeclare(promptId, variable.id))}
          >
            Remove
          </Button>
        </div>
      )}

      <form
        className="variables-details"
        onSubmit={(event) => {
          event.preventDefault();
          run(() =>
            setDetails(
              promptId,
              variable.id,
              hasDefault ? defaultValue : null,
              description.trim() === "" ? null : description
            )
          );
        }}
      >
        <label className="variables-has-default">
          <input
            type="checkbox"
            checked={hasDefault}
            onChange={(event) => setHasDefault(event.target.checked)}
          />
          Has a default, so the caller may leave it out
        </label>
        {hasDefault && (
          <>
            <label className="field" htmlFor={`default-${variable.id}`}>
              Default for {variable.name}
            </label>
            <Input
              id={`default-${variable.id}`}
              value={defaultValue}
              onChange={(event) => setDefaultValue(event.target.value)}
            />
          </>
        )}
        <label className="field" htmlFor={`description-${variable.id}`}>
          What {variable.name} is for
        </label>
        <Input
          id={`description-${variable.id}`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <Button type="submit" size="sm" disabled={pending}>
          Save
        </Button>
      </form>
    </li>
  );
}

/** "in 3 places" reads better than a list of ids, and the count is the fact that matters. */
function whereUsed(occurrences: readonly VariableOccurrence[]): string {
  const count = occurrences.length;
  const handEdits = occurrences.filter((o) => o.source === "edited by hand").length;
  const base = count === 1 ? "in 1 place" : `in ${count} places`;
  return handEdits === 0 ? base : `${base}, ${handEdits} of them edited by hand`;
}
