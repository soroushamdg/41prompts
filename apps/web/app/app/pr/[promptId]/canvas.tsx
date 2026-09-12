"use client";

import { BLOK_KINDS, type BlokKind } from "@41prompts/core";
import { BlokCard, BlokKindGlyph, Button, Tag } from "@41prompts/ui";
import { useCallback, useId, useRef, useState } from "react";
import {
  addBlokAction,
  deleteBlokAction,
  moveBlokAction,
  neighbourRanksAction,
  undoDeleteBlokAction,
} from "@/lib/canvas/actions";
import type { CanvasBlok } from "@/lib/canvas/queries";
import { BlokEditor } from "./blok-editor";

const KIND_NAME: Record<BlokKind, string> = {
  context: "Context",
  constraint: "Constraint",
  example: "Example",
  expected: "Expected",
  image_ref: "Image reference",
  image_input: "Image input",
};

/**
 * The canvas: add, edit, reorder, delete, undo.
 *
 * ## Reorder is a keyboard operation first
 *
 * `CLAUDE.md` rule 12 — every interactive element works by keyboard and by touch — and the epic is
 * explicit that drag-and-drop which only works with a mouse fails it. So the **keyboard path is the
 * implementation**: each card's move controls are real buttons, movement is arrow keys, there are
 * `aria-describedby` instructions, and a polite live region announces the new position after every
 * move. A mouse drag would be additive on top of this, not the other way round.
 *
 * ## Optimistic, because the alternative loses work
 *
 * A move updates local order first and catches up after. A failed move puts the card back and says
 * so. Nothing here ever replaces a textarea's contents with a server value — see `blok-editor.tsx`.
 */
export function Canvas({ promptId, initial }: { promptId: string; initial: CanvasBlok[] }) {
  const [bloks, setBloks] = useState(initial);
  /**
   * Deleted bloks, kept whole for the length of the session (decision 8).
   *
   * **The card itself, not just its id.** The first version looked the blok up in `initial` on undo,
   * which silently could not restore anything added during this session — the row came back in the
   * database and the card never reappeared, so the person saw their writing vanish twice. Caught by
   * the round-trip e2e, which is the reason that criterion is one test and not six.
   */
  const [deleted, setDeleted] = useState<{ blok: CanvasBlok; at: number }[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [message, setMessage] = useState<string | undefined>();
  const instructionsId = useId();
  const busy = useRef(false);

  const announce = useCallback((text: string) => setAnnouncement(text), []);

  async function add(kind: BlokKind) {
    const result = await addBlokAction(promptId, kind, "");
    if (!result.ok || result.id === undefined) {
      setMessage(result.message ?? "That blok could not be added.");
      return;
    }
    setBloks((current) => [
      ...current,
      { id: result.id!, kind, text: "", rank: "", editedText: null, editedFromHash: null },
    ]);
    announce(`${KIND_NAME[kind]} blok added at position ${bloks.length + 1}.`);
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= bloks.length || busy.current) return;
    busy.current = true;

    const before = bloks;
    const next = [...bloks];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    setBloks(next);
    announce(`Moved to position ${target + 1} of ${next.length}.`);

    // Ask the server for the ranks around the new slot rather than computing them here: the client
    // holds a view, the database holds the order, and only one of them can be right.
    const neighbours = await neighbourRanksAction(promptId, target + (direction === 1 ? 1 : 0));
    const result =
      neighbours === undefined
        ? { ok: false as const, message: "That prompt is not available." }
        : await moveBlokAction(promptId, moved!.id, neighbours);

    if (!result.ok) {
      setBloks(before);
      setMessage(result.message ?? "That move did not save.");
      announce("That move did not save. The card is back where it was.");
    }
    busy.current = false;
  }

  async function remove(index: number) {
    const blok = bloks[index]!;
    const result = await deleteBlokAction(promptId, blok.id);
    if (!result.ok) {
      setMessage(result.message ?? "That blok could not be deleted.");
      return;
    }
    setBloks((current) => current.filter((candidate) => candidate.id !== blok.id));
    // The row is still in the database — `deleteBlok` sets a column — so undo is clearing that
    // column rather than rebuilding someone's writing from memory.
    setDeleted((current) => [...current, { blok, at: index }]);
    announce("Blok deleted. Undo is available.");
  }

  async function undo(blok: CanvasBlok, at: number) {
    const result = await undoDeleteBlokAction(promptId, blok.id);
    if (!result.ok) {
      setMessage(result.message ?? "That blok could not be brought back.");
      return;
    }
    setDeleted((current) => current.filter((entry) => entry.blok.id !== blok.id));
    setBloks((current) => {
      const next = [...current];
      next.splice(Math.min(at, next.length), 0, blok);
      return next;
    });
    announce("Blok restored.");
  }

  return (
    <div className="canvas">
      {/* Describes what is actually true. An earlier version said "focus a card and press the up
          and down arrow keys" — written before the card stopped being focusable to fix a
          nested-interactive violation, and left behind. A screenshot caught it. Instructions that
          are read out by a screen reader and describe a control that does not exist are worse than
          no instructions. */}
      <p id={instructionsId} className="canvas-instructions">
        Use a card&rsquo;s move buttons to change its position. With a move button focused, the up
        and down arrow keys do the same thing.
      </p>

      <div className="canvas-add" role="group" aria-label="Add a blok">
        {BLOK_KINDS.map((kind) => (
          <Button key={kind} size="sm" variant="ghost" onClick={() => void add(kind)}>
            Add {KIND_NAME[kind].toLowerCase()}
          </Button>
        ))}
      </div>

      {bloks.length === 0 ? (
        <p className="app-empty">No bloks yet. Add one above.</p>
      ) : (
        <ol className="canvas-list">
          {bloks.map((blok, index) => (
            <li key={blok.id}>
              {/* `as="div"`: this card *contains* controls, so it must not also claim to be one.
                  A button wrapping a textarea is `nested-interactive` — the canvas's axe test
                  found it, and screen readers can fail to announce the textarea at all. */}
              <BlokCard
                as="div"
                kind={blok.kind}
                kindTag={<Tag>{KIND_NAME[blok.kind]}</Tag>}
                leading={<BlokKindGlyph kind={blok.kind} />}
                aria-label={`${KIND_NAME[blok.kind]} blok, position ${index + 1} of ${bloks.length}`}
                role="group"
                meta={
                  <>
                    <span>
                      {index + 1} of {bloks.length}
                    </span>
                    {blok.editedText !== null && <span>edited by hand</span>}
                  </>
                }
              >
                <BlokEditor promptId={promptId} blokId={blok.id} initialText={blok.text} />
              </BlokCard>

              {/* The keyboard path, and it is the implementation rather than an accessory: these
                  are real buttons reached by Tab and activated by Enter, with the arrow keys as an
                  accelerator once focus is on one. Rule 12 — a drag that only works with a mouse
                  fails it, and would pass a careless review. */}
              <div
                className="canvas-card-controls"
                role="group"
                aria-label={`Move or delete blok ${index + 1}`}
                aria-describedby={instructionsId}
                onKeyDown={(event) => {
                  if (event.key === "ArrowUp") {
                    event.preventDefault();
                    void move(index, -1);
                  }
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    void move(index, 1);
                  }
                }}
              >
                <Button size="sm" variant="ghost" onClick={() => void move(index, -1)} disabled={index === 0}>
                  Move up
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void move(index, 1)}
                  disabled={index === bloks.length - 1}
                >
                  Move down
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(index)}>
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {deleted.length > 0 && (
        <div className="canvas-undo" role="group" aria-label="Undo deleted bloks">
          {deleted.map((entry) => (
            <Button key={entry.blok.id} size="sm" onClick={() => void undo(entry.blok, entry.at)}>
              Undo delete
            </Button>
          ))}
        </div>
      )}

      {message !== undefined && (
        <p role="status" className="app-form-message">
          {message}
        </p>
      )}

      {/* Politely, so a reorder does not interrupt whatever is being read. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
