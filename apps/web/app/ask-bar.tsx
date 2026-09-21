"use client";

import { useEffect, useRef, useState } from "react";
import { AskDialog } from "./ask-chip";

/**
 * The mockup's hero Ask-AI bar: a prefix, a field, and `Ask →`.
 *
 * **It opens the same sheet the chips open** — `AskDialog`, extracted from `ask-chip.tsx` for this.
 * Everything that file promises still holds here: the sheet shows the exact text that will be sent,
 * editable, and nothing of ours is called. No endpoint, no analytics event, no id; the reader's
 * question never reaches this server.
 *
 * ## The rotating placeholder, and the three things that stop it
 *
 * The mockup cycles five questions through the placeholder every 3400ms
 * (`41prompts-full-mockup.html`, "rotating placeholder"). This does the same, with the gates
 * `capability-rotator.tsx` already established for the same problem — auto-updating content with no
 * way to stop it is a WCAG 2.2.2 failure, and the mockup has no gates at all:
 *
 * - **Reduced motion**: the timer never starts, and the field shows the first question. That is the
 *   end state of a cycle, not a skipped one.
 * - **Focused**: the rotation stops **for good**, and the field settles back on the first question.
 *   A hint that keeps changing under the cursor of somebody about to type in the box is the exact
 *   thing 2.2.2 is about, and stopping on focus is the least intrusive mechanism available.
 * - **Has a value**: nothing rotates, because there is no placeholder to see.
 *
 * **Settling back on the first question rather than freezing wherever the timer was** is also what
 * makes the page's visual baseline a picture of something. A screenshot that captured whichever of
 * five sentences the interval had reached would be flaky by construction — `docs/PROCESS.md`'s own
 * rule about waiting on a condition rather than a duration, arriving as a screenshot rather than as
 * an assertion. The first question is what every reader sees on arrival, so it is what the baseline
 * holds, and `landing.spec.ts` gets there by doing what a reader does: focusing the field.
 */

/**
 * The mockup's five, verbatim.
 *
 * **Exported so `ask-bar.test.tsx` can run `NOT_TRUE_YET` over all five.** Only the first is in the
 * server-rendered HTML, so `page.test.tsx`'s denylist — which reads the rendered page — sees one of
 * them and the other four reach a reader without any guard having looked at them.
 */
export const ROTATING = [
  "What is a blok?",
  "How is this different from Langfuse?",
  "Can I change a prompt without shipping an app update?",
  "What does the decompiler find in a long prompt?",
  "How do I test one prompt on three models?"
] as const;

/** The mockup's interval. */
const ROTATE_MS = 3_400;

/** What the sheet opens with when the reader pressed `Ask →` having typed nothing. */
const DEFAULT_QUESTION = "What is 41Prompts and who is it for?";

export function AskBar() {
  const [typed, setTyped] = useState("");
  const [index, setIndex] = useState(0);
  const [stopped, setStopped] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (stopped || typed.length > 0) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => (i + 1) % ROTATING.length), ROTATE_MS);
    return () => window.clearInterval(timer);
  }, [stopped, typed.length]);

  return (
    <div className="askai">
      {/* Decorative: the field's own name is the label below, and a prefix that also named it
          would put "ASK AI Ask anything…" into the accessibility tree. */}
      <span className="askai-prefix" aria-hidden="true">
        Ask AI
      </span>
      <label className="sr-only" htmlFor="ask-ai">
        Ask anything about 41Prompts
      </label>
      <input
        id="ask-ai"
        type="text"
        className="askai-field"
        autoComplete="off"
        value={typed}
        placeholder={ROTATING[stopped ? 0 : index]}
        onFocus={() => setStopped(true)}
        onChange={(event) => setTyped(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          // Not a `<form>`: there is nothing to submit — the sheet is the whole of what happens
          // next, and a form on a marketing page that posts nowhere is a navigation waiting to
          // happen if the JavaScript has not loaded. Pressing the button is what Enter means here.
          event.preventDefault();
          trigger.current?.click();
        }}
      />
      <AskDialog
        question={typed.trim().length > 0 ? typed.trim() : DEFAULT_QUESTION}
        triggerClassName="askai-go"
        triggerRef={trigger}
      >
        Ask →
      </AskDialog>
    </div>
  );
}
