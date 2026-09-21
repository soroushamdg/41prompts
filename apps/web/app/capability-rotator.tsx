"use client";

import { Tabs } from "@41prompts/ui";
import { useEffect, useMemo, useState } from "react";

/**
 * The mockup's capability rotator: five tabs down the side, one panel beside them, advancing on a
 * timer until the reader takes it over.
 *
 * ## Why it takes strings and not the claims themselves
 *
 * `lib/site/claims.ts` imports the retention constants from `@41prompts/db`, because a number a
 * purge job enforces and a number a page prints have to be the same number. That makes the registry
 * a server module: importing it here would drag Drizzle into the browser bundle. So the server
 * reads the registry and hands this component the sentences, which is also the boundary that keeps
 * this file from being a second place where copy lives.
 *
 * ## What it does that the mockup does not
 *
 * - **Real ARIA tabs**, per `docs/design/README.md`'s corrections. The mockup puts `aria-selected`
 *   on plain buttons inside a `role="tablist"` with no `role="tab"`, no `aria-controls`, no roving
 *   tab stop and no panel relationship — a screen reader is told there is a tablist and then finds
 *   nothing in it. `packages/ui`'s `Tabs` is the pattern, extended here with `orientation` because
 *   this list runs down the page and therefore moves on Up and Down.
 * - **It stops when the reader takes hold of it.** The epic's acceptance criterion says "advances
 *   on a timer, stops on click", and that is also the accessible behaviour: an auto-advancing strip
 *   that carries on after somebody has chosen "Publish" takes the page away from them five seconds
 *   later. Hovering pauses it too, so reading a panel does not become a race.
 * - **Reduced motion does not start the timer at all**, and the sweep renders full rather than
 *   animating. That is the end state of a five-second sweep, not a skipped one: the rotator sits on
 *   a panel with its indicator complete, which is exactly where the animation would have left it.
 */

export interface RotatorItem {
  /** Stable, used for the tab and panel ids. */
  readonly value: string;
  /** The word on the tab. One word, as in the mockup. */
  readonly text: string;
  /** The panel's heading. Structural copy — it asserts nothing, so it is not a registry claim. */
  readonly heading: string;
  /** Sentences from `lib/site/claims.ts`, already resolved by the server. */
  readonly lines: readonly string[];
}

/** The mockup's cycle, and the duration the sweep indicator is drawn against. */
const CYCLE_MS = 5_000;

export function CapabilityRotator({ items, name }: { readonly items: readonly RotatorItem[]; readonly name: string }) {
  const first = items[0]?.value ?? "";
  const [value, setValue] = useState(first);
  /** Set once, by a click or an arrow key. The timer never comes back — see the header. */
  const [takenOver, setTakenOver] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const cycling = !takenOver && !hovered && !reduced;

  useEffect(() => {
    if (!cycling) return;
    const timer = window.setTimeout(() => {
      const index = items.findIndex((item) => item.value === value);
      const next = items[(index + 1) % items.length];
      if (next) setValue(next.value);
    }, CYCLE_MS);
    return () => window.clearTimeout(timer);
  }, [cycling, items, value]);

  const tabItems = useMemo(
    () =>
      items.map((item) => ({
        value: item.value,
        text: (
          <>
            {item.text}
            {/* The sweep. Decorative: the selected state is already carried by `aria-selected`. */}
            <i className="rot-sweep" aria-hidden="true" />
          </>
        ),
        panel: (
          <div className="rot-body">
            <h3>{item.heading}</h3>
            {item.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )
      })),
    [items]
  );

  return (
    <div
      className="rot"
      data-cycling={cycling ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Tabs
        className="rot-tabs"
        name={name}
        orientation="vertical"
        items={tabItems}
        value={value}
        onValueChange={(next) => {
          setTakenOver(true);
          setValue(next);
        }}
      />
    </div>
  );
}
