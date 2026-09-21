"use client";

import { Button, Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger, Textarea } from "@41prompts/ui";
import { useState, type ReactNode, type RefObject } from "react";

/**
 * The mockup's Ask-AI chip: a question about the product, handed to whichever assistant the reader
 * already uses.
 *
 * **The property worth keeping from the prototype is the textarea, not the chip.** It opens showing
 * the exact text that will be sent, editable, above four destinations. A handoff that sends
 * something the reader did not see is a handoff that can carry anything — a referrer, a campaign
 * string, a sentence they would not have asked. So the sheet's own label is "This is exactly what
 * will be sent", and it is true: the value of the textarea is the whole of the query string.
 *
 * **Nothing of ours is called.** No endpoint, no analytics event, no id. The chip opens a dialog and
 * the dialog opens somebody else's site in a new tab with `noopener`. The reader's question never
 * reaches this server, which is the only version of this feature that does not need a privacy
 * sentence.
 *
 * Radix's Dialog is what `packages/ui` already wraps, so Escape, the scrim, the focus trap and
 * `aria-modal` are its problem rather than a reimplementation here — `docs/design/README.md` lists
 * "real ARIA" among the things the prototypes get wrong and the build must get right.
 */

export interface AskChipProps {
  /** The question, as it will be sent. Written out in full: the chip's own text is a summary. */
  readonly question: string;
  /** What the chip says. Short. */
  readonly children: ReactNode;
}

export interface AskDialogProps {
  /** The question the sheet opens with. Editable once it is open; this is only the starting text. */
  readonly question: string;
  /** The class the trigger wears. The chip has its own shape; the ask bar's `Ask →` has another. */
  readonly triggerClassName: string;
  /** What the trigger says. */
  readonly children: ReactNode;
  /**
   * A handle on the trigger button, so something else on the page can open the sheet.
   *
   * The ask bar needs Enter in its input to do what pressing `Ask →` does, and the honest way to
   * express that is to press the button — not to lift `open` into a second piece of state that has
   * to be kept in step with Radix's own. `ref.current.click()` is the same event path a pointer
   * takes.
   */
  readonly triggerRef?: RefObject<HTMLButtonElement | null>;
}

interface Destination {
  readonly name: string;
  readonly url: (question: string) => string;
}

/**
 * Four destinations, each one a search or chat URL that takes its query in the URL.
 *
 * Exported so `ask-bar.test.tsx` can assert every one **encodes** rather than interpolates — a
 * question with an `&` in it must not become two parameters, and a question with a `#` in it must
 * not become a fragment. That comment has named a file since EPIC-016b and the file did not exist
 * until EPIC-016d, which is the kind of claim a test is cheaper than.
 */
export const ASK_DESTINATIONS: readonly Destination[] = [
  { name: "Claude", url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: "ChatGPT", url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { name: "Perplexity", url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}` },
  { name: "Google AI", url: (q) => `https://www.google.com/search?udm=50&q=${encodeURIComponent(q)}` }
];

/**
 * The sheet, and whatever opens it.
 *
 * **Extracted from `AskChip` in EPIC-016d**, when the mockup's hero Ask-AI bar arrived and needed
 * the identical sheet behind a different trigger. Two copies of a dialog that hands a reader's
 * typed text to somebody else's website is two places for the "this is exactly what will be sent"
 * promise to stop being true, so there is one.
 */
export function AskDialog({ question, triggerClassName, children, triggerRef }: AskDialogProps) {
  const [text, setText] = useState(question);
  const [copied, setCopied] = useState(false);

  return (
    <Dialog
      onOpenChange={(open) => {
        // Reopening after an edit should offer the question again, not the last edit.
        if (open) {
          setText(question);
          setCopied(false);
        }
      }}
    >
      {/* Not `DialogTrigger asChild` around a `Button`: the chip has its own shape in the mockup and
          `Button` would bring its own. This is the one interactive surface on these pages. */}
      <DialogTrigger className={triggerClassName} ref={triggerRef}>
        {children}
      </DialogTrigger>
      <DialogContent>
        <div className="sheet-header">
          <DialogTitle>Ask an AI about 41Prompts</DialogTitle>
        </div>
        <div className="sheet-body">
          <label className="ask-sheet-label" htmlFor="ask-sheet-text">
            This is exactly what will be sent.
          </label>
          <Textarea
            id="ask-sheet-text"
            rows={5}
            spellCheck={false}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="ask-sheet-dests">
            {ASK_DESTINATIONS.map((destination) => (
              <Button
                key={destination.name}
                type="button"
                size="sm"
                onClick={() => window.open(destination.url(text), "_blank", "noopener,noreferrer")}
              >
                {destination.name}
              </Button>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            style={{ width: "100%", marginTop: "12px" }}
            onClick={() => {
              void navigator.clipboard?.writeText(text);
              setCopied(true);
            }}
          >
            {copied ? "Copied" : "Copy instead"}
          </Button>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" style={{ width: "100%", marginTop: "8px" }}>
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function AskChip({ question, children }: AskChipProps) {
  return (
    <AskDialog question={question} triggerClassName="ask-chip">
      {children}
      <span className="ask-chip-mark" aria-hidden="true">
        ↗ AI
      </span>
    </AskDialog>
  );
}

/**
 * A row of chips. Its own component only so every page spells the spacing the same way.
 *
 * `className` is for the hero's four suggestion chips, which the mockup draws tighter and narrower
 * than the ones beside a section heading (`.asksugg` against `.chiprow`). It adds to the shared
 * class rather than replacing it, so a caller cannot quietly opt out of the spacing.
 */
export function AskChipRow({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={className ? `ask-chiprow ${className}` : "ask-chiprow"}>{children}</div>;
}
