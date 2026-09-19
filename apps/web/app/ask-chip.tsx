"use client";

import { Button, Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger, Textarea } from "@41prompts/ui";
import { useState, type ReactNode } from "react";

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

interface Destination {
  readonly name: string;
  readonly url: (question: string) => string;
}

/**
 * Four destinations, each one a search or chat URL that takes its query in the URL.
 *
 * Exported so `ask-chip.test.tsx` can assert every one encodes rather than interpolates — a
 * question with an `&` in it must not become two parameters.
 */
const ASK_DESTINATIONS: readonly Destination[] = [
  { name: "Claude", url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: "ChatGPT", url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
  { name: "Perplexity", url: (q) => `https://www.perplexity.ai/search?q=${encodeURIComponent(q)}` },
  { name: "Google AI", url: (q) => `https://www.google.com/search?udm=50&q=${encodeURIComponent(q)}` }
];

export function AskChip({ question, children }: AskChipProps) {
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
      <DialogTrigger className="ask-chip">
        {children}
        <span className="ask-chip-mark" aria-hidden="true">
          ↗ AI
        </span>
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

/** A row of chips. Its own component only so every page spells the spacing the same way. */
export function AskChipRow({ children }: { readonly children: ReactNode }) {
  return <div className="ask-chiprow">{children}</div>;
}
