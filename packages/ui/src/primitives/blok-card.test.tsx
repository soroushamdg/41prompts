import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlokCard } from "./blok-card.js";
import { BlokKindGlyph } from "./blok-kind-glyph.js";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "recipes.css"), "utf-8");

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
 * **Decision 6's guard, asserted on the stylesheet rather than on a screenshot.**
 *
 * A visual baseline cannot tell a persistent tint from an intended one, and EPIC-020 measured that a
 * 1% pixel tolerance absorbs changes far larger than a rail. So this reads the rule out of the CSS:
 * every selector that paints a category colour must be gated on an interaction state.
 */
describe("blok category colour appears only during interaction", () => {
  const kindColourRules = css
    .split("}")
    .map((block) => block.trim())
    .filter((block) => /--color-kind-|var\(--blok-kind\)/.test(block));

  it("has a rule for each of the six kinds", () => {
    for (const kind of ["context", "constraint", "example", "expected", "image_ref", "image_input"]) {
      expect(css).toContain(`[data-kind="${kind}"]`);
    }
  });

  it("paints with the category colour only under :hover, :focus-visible or [data-selected]", () => {
    const painting = kindColourRules.filter((block) => block.includes("var(--blok-kind)"));
    expect(painting.length).toBeGreaterThan(0);
    for (const block of painting) {
      const selector = block.split("{")[0]!;
      expect(
        /:hover|:focus-visible|\[data-selected/.test(selector),
        `a category colour is painted at rest by: ${selector.trim()}`
      ).toBe(true);
    }
  });

  it("a card at rest carries no category colour in its own markup", () => {
    const { container } = render(
      <BlokCard kindTag="Constraint" kind="constraint" leading={<BlokKindGlyph kind="constraint" />}>
        text
      </BlokCard>
    );
    // No inline style, no colour class — the rest state is ink, and the only distinction is the
    // glyph plus the kind's name as text.
    const html = container.innerHTML;
    expect(html).not.toMatch(/style="[^"]*color/);
    expect(html).not.toMatch(/--color-kind-/);
  });

  it("never reaches for a reserved token", () => {
    for (const block of kindColourRules) {
      expect(block).not.toMatch(/--color-(pass|fail|warn)/);
    }
  });
});
