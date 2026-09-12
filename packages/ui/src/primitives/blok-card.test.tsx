import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BlokCard } from "./blok-card";
import { BlokKindGlyph } from "./blok-kind-glyph";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "recipes.css"), "utf-8");

describe("BlokCard", () => {
  it("is a real button, so every blok is keyboard-reachable", () => {
    const html = renderToStaticMarkup(<BlokCard kindTag="Context">text</BlokCard>);
    expect(html).toMatch(/^<button/);
    expect(html).toContain('type="button"');
  });

  it("carries its kind as data, for the category colour to key on", () => {
    const html = renderToStaticMarkup(
      <BlokCard kindTag="Constraint" kind="constraint">
        text
      </BlokCard>
    );
    expect(html).toContain('data-kind="constraint"');
  });

  it("is byte-identical to the old markup when no kind is given, so committed baselines hold", () => {
    const html = renderToStaticMarkup(<BlokCard kindTag="Context">text</BlokCard>);
    expect(html).not.toContain("data-kind");
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
    const html = renderToStaticMarkup(
      <BlokCard kindTag="Constraint" kind="constraint" leading={<BlokKindGlyph kind="constraint" />}>
        text
      </BlokCard>
    );
    // No inline style, no colour class — the rest state is ink, and the only distinction is the
    // glyph plus the kind's name as text.
    expect(html).not.toMatch(/style="[^"]*color/);
    expect(html).not.toMatch(/--color-kind-/);
  });

  it("never reaches for a reserved token", () => {
    for (const block of kindColourRules) {
      expect(block).not.toMatch(/--color-(pass|fail|warn)/);
    }
  });
});
