"use client";

import { Textarea } from "@41prompts/ui";
import { memo, useEffect, useRef, useState } from "react";
import { saveBlokTextAction } from "@/lib/canvas/actions";

/** How long typing pauses before a write. Long enough not to write per keystroke, short enough that
 * leaving the page seconds later has already saved. */
const DEBOUNCE_MS = 600;

type SaveState = "idle" | "saving" | "saved" | "failed";

/**
 * One blok's text, autosaved (decision 4).
 *
 * ## The rule this component exists to keep
 *
 * **The server's value is never written back into the field.** Not on success, not on failure, not
 * on reconnect. The field belongs to the person typing in it, and a component that adopts a server
 * value mid-sentence deletes the end of that sentence — which is the class of failure this whole
 * epic is careful about. The server is told what the text is; it never tells the field.
 *
 * On a failed write the typed text stays exactly where it is, the state says so **in words**, and a
 * retry happens on the next keystroke. Nothing is lost by a failure, and nothing is lost by walking
 * away from a failure either, because the text is still on screen.
 *
 * ## Why the state is words and not a colour
 *
 * `CLAUDE.md` rule 10: pass/fail is never shown by colour alone, and green, red and amber are
 * reserved for pass, fail and drift regardless — none of which this is. "Saved", "Saving…" and "Not
 * saved" are the whole signal.
 */
/**
 * Memoised, and the reason is measured rather than precautionary.
 *
 * A reorder changes every card's position line, so React re-renders the whole list. At 60 bloks
 * that dragged one keyboard move to 157 ms against the epic's 100 ms budget — the textareas were the
 * cost. None of this component's props change when the order does, so memoising takes the sixty
 * textareas out of a reorder entirely and leaves only the card chrome to repaint.
 */
export const BlokEditor = memo(function BlokEditor({
  promptId,
  blokId,
  initialText,
}: {
  promptId: string;
  blokId: string;
  initialText: string;
}) {
  const [text, setText] = useState(initialText);
  const [state, setState] = useState<SaveState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(initialText);

  useEffect(() => () => clearTimeout(timer.current), []);

  function schedule(next: string) {
    latest.current = next;
    // Back to idle the moment a key lands. Leaving "Saved" on screen while there are keystrokes it
    // does not cover is a small lie, and it is the exact lie that makes somebody close a tab early.
    setState("idle");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setState("saving");
      void saveBlokTextAction(promptId, blokId, latest.current)
        .then((result) => setState(result.ok ? "saved" : "failed"))
        // A rejected action is the same outcome as a refused one, and the same promise holds: the
        // text stays in the field.
        .catch(() => setState("failed"));
    }, DEBOUNCE_MS);
  }

  return (
    <div className="blok-editor">
      <label className="sr-only" htmlFor={`blok-${blokId}`}>
        Blok text
      </label>
      <Textarea
        id={`blok-${blokId}`}
        value={text}
        rows={3}
        onChange={(event) => {
          setText(event.target.value);
          schedule(event.target.value);
        }}
        // Stops an arrow key inside the textarea reordering the card underneath it.
        onKeyDown={(event) => event.stopPropagation()}
      />
      <p className="blok-editor-state" role="status" data-state={state}>
        {state === "saving" && "Saving…"}
        {state === "saved" && "Saved"}
        {state === "failed" && "Not saved. Your text is still here; it will try again as you type."}
      </p>
    </div>
  );
});
