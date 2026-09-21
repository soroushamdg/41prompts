import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlokCard } from "./blok-card.js";
import { BlokKindGlyph } from "./blok-kind-glyph.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "recipes.css"), "utf-8");

/**
 * The stylesheet with its comments removed.
 *
 * **A comment is not a rule, and letting one count as one is a failure this repository has already
 * paid for twice** — EPIC-900's dead-code gate read a name out of prose and called it a use, and
 * then read its own header and did it again. The rules below split on `}` and ask what a selector
 * paints; a `/* … *\/` block sitting above a rule is glued to it by that split, so the paragraph
 * explaining *why* the reserved hues are refused would itself be read as a rule reaching for one.
 *
 * Stripping weakens nothing: a comment cannot paint a pixel.
 */
const rules = css.replace(/\/\*[\s\S]*?\*\//g, " ");

describe("BlokCard", () => {
  it("is a real button by default, so a selectable blok is keyboard-reachable", () => {
    const { container } = render(<BlokCard kindTag="Context">text</BlokCard>);
    const card = container.querySelector(".blok-card")!;
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type")).toBe("button");
  });

  /**
   * The canvas's card holds a textarea and its own buttons. A `<button>` wrapping those is
   * `nested-interactive` — axe flags it and screen readers genuinely mishandle it, sometimes not
   * announcing the textarea at all. Found by the canvas's axe test, not by reasoning.
   */
  it("renders as a plain container when asked, for a card that contains controls", () => {
    const { container } = render(
      <BlokCard as="div" kindTag="Context">
        text
      </BlokCard>
    );
    const card = container.querySelector(".blok-card")!;
    expect(card.tagName).toBe("DIV");
    expect(card.hasAttribute("type")).toBe(false);
  });

  it("carries its kind as data, for the category colour to key on", () => {
    const { container } = render(
      <BlokCard kindTag="Constraint" kind="constraint">
        text
      </BlokCard>
    );
    expect(container.querySelector(".blok-card")!.getAttribute("data-kind")).toBe("constraint");
  });

  it("carries no kind attribute when none is given, so committed baselines hold", () => {
    const { container } = render(<BlokCard kindTag="Context">text</BlokCard>);
    expect(container.querySelector(".blok-card")!.hasAttribute("data-kind")).toBe(false);
  });
});

/**
 * **The persistent-colour contract, asserted on the stylesheet rather than on a screenshot.**
 *
 * A visual baseline cannot tell an intended tint from an accidental one, and EPIC-020 measured that
 * a 1% pixel tolerance absorbs changes far larger than a rail. So this reads the rules out of the
 * CSS.
 *
 * **EPIC-016d rewrote this block and did not delete it.** Until 2026-09-21 it asserted the opposite
 * rule — that a category colour may be painted *only* under `:hover`, `:focus-visible` or
 * `[data-selected]` — which was EPIC-021a decision 6 and was correct for as long as that was the
 * decision. Soroush answered the mockup-parity question the other way, so the guard now pins the
 * new contract with the same three properties the old one pinned:
 *
 * 1. all six kinds resolve;
 * 2. the colour is painted at rest, and **only** on a card that declares a kind;
 * 3. no kind rule ever reaches for a reserved token.
 *
 * (3) is unchanged, and it is the one that carries `CLAUDE.md` rule 10. It is the reason the answer
 * was EPIC-021a's palette rather than the mockup's `--kc`, whose `expected` is `--color-pass`
 * exactly.
 */
describe("blok category colour is persistent, and only where a kind is declared", () => {
  const kindColourRules = rules
    .split("}")
    .map((block) => block.trim())
    .filter((block) => /--color-kind-|var\(--blok-kind\)/.test(block));

  it("has a rule for each of the six kinds", () => {
    for (const kind of ["context", "constraint", "example", "expected", "image_ref", "image_input"]) {
      expect(css).toContain(`[data-kind="${kind}"]`);
    }
  });

  it("paints the rail and the kind tag at rest, with no interaction state in the selector", () => {
    const painting = kindColourRules.filter((block) => block.includes("var(--blok-kind)"));
    expect(painting.length, "nothing paints the category colour at all").toBeGreaterThan(0);

    const selectors = painting.map((block) => block.split("{")[0]!.trim());
    // The rail and the tag are the two the mockup draws. Both must be here, and at rest.
    expect(selectors.some((s) => s.includes("::before")), `no rail rule among: ${selectors.join(" | ")}`).toBe(true);
    expect(selectors.some((s) => s.includes(".tag")), `no kind-tag rule among: ${selectors.join(" | ")}`).toBe(true);
  });

  /**
   * **The half that keeps `/dev/ui`'s baselines still**, and the half that makes the rule above
   * safe: every selector that paints the colour is gated on `[data-kind]`, so a card that declares
   * no kind cannot be reached by any of them.
   *
   * `gallery-client.tsx` renders `BlokCard` without a `kind` prop and always has. If a rule here
   * ever drops the attribute gate, that gallery changes and its two committed Linux screenshots
   * fail — a long way from this file, with nothing naming the cause. This fails first instead.
   */
  it("reaches no card that declares no kind", () => {
    const painting = kindColourRules.filter((block) => block.includes("var(--blok-kind)"));
    for (const block of painting) {
      const selector = block.split("{")[0]!;
      expect(
        selector.includes("[data-kind]") || /\[data-kind="/.test(selector),
        `a category colour is painted by an ungated selector: ${selector.trim()}`
      ).toBe(true);
    }
  });

  it("carries the colour on a kinded card and nothing on an unkinded one", () => {
    const kinded = render(
      <BlokCard kindTag="Constraint" kind="constraint" leading={<BlokKindGlyph kind="constraint" />}>
        text
      </BlokCard>
    );
    expect(kinded.container.querySelector(".blok-card")!.getAttribute("data-kind")).toBe("constraint");

    // The markup carries the kind and nothing else — no inline colour, no per-kind class. Every
    // hue is resolved by the stylesheet from that one attribute, which is what makes the theme
    // switch work and what makes the rule above checkable at all.
    const html = kinded.container.innerHTML;
    expect(html).not.toMatch(/style="[^"]*color/);
    expect(html).not.toMatch(/--color-kind-/);

    const plain = render(<BlokCard kindTag="Context">text</BlokCard>);
    expect(plain.container.querySelector(".blok-card")!.hasAttribute("data-kind")).toBe(false);
  });

  it("never reaches for a reserved token", () => {
    for (const block of kindColourRules) {
      expect(block).not.toMatch(/--color-(pass|fail|warn)/);
    }
  });
});
