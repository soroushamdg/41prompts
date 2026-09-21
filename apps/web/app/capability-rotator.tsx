"use client";

import { Tabs } from "@41prompts/ui";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The mockup's capability rotator: five tabs down the side, one panel beside them, advancing on a
 * timer while the section is on screen.
 *
 * ## Why it takes strings and not the claims themselves
 *
 * `lib/site/claims.ts` imports the retention constants from `@41prompts/db`, because a number a
 * purge job enforces and a number a page prints have to be the same number. That makes the registry
 * a server module: importing it here would drag Drizzle into the browser bundle. So the server
 * reads the registry and hands this component the sentences, which is also the boundary that keeps
 * this file from being a second place where copy lives. `illustration` arrives the same way — the
 * server builds the picture, this file only decides which one is showing.
 *
 * ## The three things that decide whether the timer is running
 *
 * `cycling` is a single derived boolean, and each of its three terms is here for its own reason:
 *
 * - **On screen.** The mockup gates the cycle on an `IntersectionObserver` at threshold `0.2`, and
 *   EPIC-016b shipped without it. The consequence is not cosmetic: a reader scrolling slowly down
 *   the page arrives to find the rotator already three panels in, having advanced for nobody. The
 *   observer does **not** reset the index — scrolling back resumes where it was, and a reader who
 *   has not reached the section yet always finds it on *Import*.
 * - **Not hovered, and not focused.** The mockup has no pause at all. This does, because WCAG 2.2.2
 *   wants a mechanism to stop content that auto-updates, and pausing while the pointer or the
 *   keyboard is on the thing is the least intrusive one available. It is also what makes the
 *   restart below safe: a click leaves the pointer and the focus on the tab, so the cycle waits
 *   until the reader has actually finished with it.
 * - **Not reduced motion**, where the timer never starts and the sweep renders full rather than
 *   animating. That is the end state of a five-second sweep, not a skipped one.
 *
 * ## Choosing a tab restarts the cycle; it does not end it (EPIC-016c)
 *
 * EPIC-016b read its criterion as *stops on click, for good*, and `takenOver` was that state. The
 * mockup instead does `clearTimeout` → paint → `cycle()`, and Soroush's ruling of 2026-09-21 is to
 * build it the same as the mockup. **The state is simply gone**: the timer effect already depends
 * on `value`, so selecting a tab restarts the five seconds by itself, and the pause terms above are
 * what stop the panel being taken away from somebody who is still reading it.
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
  /**
   * The panel's picture of the product, built on the server and already wrapped in an `<Example>`.
   *
   * A `ReactNode` rather than markup: `home-sections.tsx` assembles these out of the design
   * system's own components, so what a reader sees is the product's interface rather than a drawing
   * of it, and a component that changes shape takes the illustration with it.
   */
  readonly illustration: ReactNode;
}

/** The mockup's cycle, and the duration the sweep indicator is drawn against. */
const CYCLE_MS = 5_000;

/** The mockup's threshold. Its observer watches the tab list; this one watches the whole rotator,
 *  which is the element this component owns a ref to — and at every viewport the page supports the
 *  rotator is a fraction of the screen's height, so a fifth of it is reachable either way. */
const VISIBLE_RATIO = 0.2;

export function CapabilityRotator({ items, name }: { readonly items: readonly RotatorItem[]; readonly name: string }) {
  const first = items[0]?.value ?? "";
  const [value, setValue] = useState(first);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const element = root.current;
    // No observer means no way to tell, and a rotator that never advances is a worse answer than
    // one that advances off screen. The gate is a courtesy to the reader, not a correctness rule.
    if (!element || typeof IntersectionObserver === "undefined") {
      setOnScreen(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) setOnScreen(entry.isIntersecting);
      },
      { threshold: VISIBLE_RATIO }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const cycling = onScreen && !hovered && !focused && !reduced;

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
            {item.illustration}
          </div>
        )
      })),
    [items]
  );

  return (
    <div
      className="rot"
      ref={root}
      data-cycling={cycling ? "true" : "false"}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      // React's `onFocus`/`onBlur` are `focusin`/`focusout`, so they fire for the tabs and for the
      // panel inside this wrapper rather than only for the wrapper itself.
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <Tabs
        className="rot-tabs"
        name={name}
        orientation="vertical"
        items={tabItems}
        value={value}
        onValueChange={setValue}
      />
    </div>
  );
}
