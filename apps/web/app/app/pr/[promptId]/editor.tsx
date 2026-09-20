"use client";

import { useState } from "react";
import type { CanvasBlok } from "@/lib/canvas/queries";
import type { CompiledPiece } from "@/lib/canvas/compiled-view";
import { Canvas } from "./canvas";
import { CompiledPane } from "./compiled-pane";

/**
 * The two halves, and the one piece of state they share.
 *
 * Linking is bidirectional (decision 2), so neither pane can own it: hovering a card highlights its
 * span, hovering a span surfaces its card, and pinning holds either from either side. It lives here
 * so there is one answer to "which blok is live" rather than two that can disagree.
 *
 * `linked` is transient (pointer or focus); `pinned` survives the pointer leaving, which is the
 * whole point of pinning and the thing touch depends on — a tap pins, a second tap or `Escape`
 * releases.
 */
export function Editor({
  promptId,
  bloks,
  pieces,
  hashes,
}: {
  promptId: string;
  bloks: CanvasBlok[];
  pieces: CompiledPiece[];
  hashes: Record<string, string>;
}) {
  const [linked, setLinked] = useState<string | undefined>();
  const [pinned, setPinned] = useState<string | undefined>();

  // A pin outranks a hover: once something is held, moving the pointer must not quietly move the
  // highlight somewhere else.
  const live = pinned ?? linked;

  return (
    /* **One card, two panes** — the mockup's `.split` (lines 187–196). It was two separate cards
       side by side with a gap and `align-items: start`, which is why the compiled pane sat short
       beside a canvas running fifteen hundred pixels down the page. The panes now share a border
       and a height, and each scrolls inside itself rather than growing the document. */
    <div className="split">
      <CompiledPane
        promptId={promptId}
        pieces={pieces}
        hashes={hashes}
        linked={live}
        pinned={pinned}
        onLink={setLinked}
        onPin={setPinned}
      />
      <Canvas
        promptId={promptId}
        initial={bloks}
        linked={live}
        pinned={pinned}
        onLink={setLinked}
        onPin={setPinned}
      />
    </div>
  );
}
