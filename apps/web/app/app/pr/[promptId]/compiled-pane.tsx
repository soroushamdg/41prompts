"use client";

import { Button, SpanStateBadge, SpanStateNote } from "@41prompts/ui";
import { useEffect, useRef, useState } from "react";
import { editSpanAction, undoUpdateFromBlokAction, updateFromBlokAction } from "@/lib/canvas/actions";
import { spanLabel, SPAN_BADGE, SPAN_SENTENCE, type CompiledPiece } from "@/lib/canvas/compiled-view";

/**
 * The compiled prompt, read-only by default (decision 1).
 *
 * ## Read-only, and entered deliberately
 *
 * The compiled text is derived; editing it is the exception. A span becomes editable only when
 * somebody presses **Edit by hand** on it, and the pane says it is edited by hand **at that moment**
 * — a pane that tells you afterwards has already let you believe the compiler still owns it.
 *
 * ## Linking
 *
 * `onLink` reports which blok a span belongs to as the pointer or focus moves over it; `pinned`
 * comes back the other way. Ink inversion, never a colour wash. Touch is the default interaction:
 * every span is a real `<button>`, so a tap links and a second tap unpins without any hover.
 */
export function CompiledPane({
  promptId,
  pieces,
  hashes,
  linked,
  pinned,
  onLink,
  onPin,
}: {
  promptId: string;
  pieces: CompiledPiece[];
  hashes: Record<string, string>;
  linked: string | undefined;
  pinned: string | undefined;
  onLink: (blokId: string | undefined) => void;
  onPin: (blokId: string | undefined) => void;
}) {
  const [editing, setEditing] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const [undoable, setUndoable] = useState<{ blokId: string; text: string; fromHash: string }[]>([]);
  const [copied, setCopied] = useState(false);
  const editor = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (editing !== undefined) editor.current?.focus();
  }, [editing]);

  /** Exactly what the model receives, separators included (decision 8). */
  const wholePrompt = pieces.map((piece) => piece.text + piece.separator).join("");

  async function save(piece: CompiledPiece) {
    const result = await editSpanAction(promptId, piece.blokId, draft, hashes[piece.blokId] ?? "");
    setEditing(undefined);
    if (!result.ok) setMessage(result.message ?? "That edit did not save.");
  }

  async function update(piece: CompiledPiece) {
    // Remembered before it is destroyed, with the hash, so undo restores the span rather than
    // approximately the span (decision 7).
    const previous = { blokId: piece.blokId, text: piece.text, fromHash: hashes[piece.blokId] ?? "" };
    const result = await updateFromBlokAction(promptId, piece.blokId);
    if (!result.ok) {
      setMessage(result.message ?? "That span could not be updated.");
      return;
    }
    setUndoable((current) => [...current, previous]);
  }

  async function undo(entry: { blokId: string; text: string; fromHash: string }) {
    const result = await undoUpdateFromBlokAction(promptId, entry.blokId, {
      text: entry.text,
      fromHash: entry.fromHash,
    });
    if (!result.ok) {
      setMessage(result.message ?? "That span could not be brought back.");
      return;
    }
    setUndoable((current) => current.filter((candidate) => candidate.blokId !== entry.blokId));
  }

  return (
    <section className="compiled-pane" aria-label="Compiled prompt">
      <div className="compiled-panebar">
        <span>Compiled prompt</span>
        <span className="compiled-readonly">read-only</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard?.writeText(wholePrompt).then(
              () => setCopied(true),
              () => setMessage("Copy did not work. Select the text and copy it by hand.")
            );
          }}
        >
          {copied ? "Copied" : "Copy prompt"}
        </Button>
      </div>

      <pre className="compiled-text" data-testid="compiled-text">
        {pieces.map((piece) => (
          <span key={piece.blokId}>
            <button
              type="button"
              className="compiled-span"
              data-blok={piece.blokId}
              data-presentation={piece.presentation}
              data-linked={linked === piece.blokId ? "true" : undefined}
              data-pinned={pinned === piece.blokId ? "true" : undefined}
              aria-pressed={pinned === piece.blokId}
              aria-label={spanLabel(piece)}
              onMouseEnter={() => onLink(piece.blokId)}
              onMouseLeave={() => onLink(undefined)}
              onFocus={() => onLink(piece.blokId)}
              onBlur={() => onLink(undefined)}
              onClick={() => onPin(pinned === piece.blokId ? undefined : piece.blokId)}
              onKeyDown={(event) => {
                if (event.key === "Escape") onPin(undefined);
              }}
            >
              {piece.text}
            </button>
            {piece.separator}
          </span>
        ))}
      </pre>

      <div className="compiled-notes">
        {pieces.map((piece) => {
          const entry = undoable.find((candidate) => candidate.blokId === piece.blokId);
          return (
            <div key={piece.blokId}>
              {editing === piece.blokId ? (
                <div className="span-state-note" role="note">
                  <label className="sr-only" htmlFor={`span-${piece.blokId}`}>
                    Edit this span by hand
                  </label>
                  <textarea
                    id={`span-${piece.blokId}`}
                    ref={editor}
                    className="field-textarea"
                    rows={3}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                  <Button size="sm" onClick={() => void save(piece)}>
                    Save this span
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(undefined)}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <>
                  <SpanStateBadge presentation={piece.presentation}>
                    {SPAN_BADGE[piece.presentation]}
                  </SpanStateBadge>
                  <SpanStateNote
                    presentation={piece.presentation}
                    action={
                      // Per span, never global. There is deliberately no "update all" here.
                      <Button size="sm" variant="ghost" onClick={() => void update(piece)}>
                        Update from blok
                      </Button>
                    }
                  >
                    {SPAN_SENTENCE[piece.presentation]}
                  </SpanStateNote>
                  {/* Available in every state, not only `in-step`. The first version offered it
                      only for an untouched span, which meant that once you had written a span you
                      could never write it again — the only way back into your own text was to
                      discard it with Update from blok. Found by the verbatim-storage test, which
                      reopens the editor to read back what it stored. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setDraft(piece.text);
                      setEditing(piece.blokId);
                    }}
                  >
                    {piece.presentation === "in-step" ? "Edit by hand" : "Edit again"}
                  </Button>
                  {entry !== undefined && (
                    <Button size="sm" onClick={() => void undo(entry)}>
                      Undo update from blok
                    </Button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {message !== undefined && (
        <p role="status" className="app-form-message">
          {message}
        </p>
      )}
    </section>
  );
}
