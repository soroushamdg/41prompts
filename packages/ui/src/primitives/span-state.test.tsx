import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { isDriftPresentation, SpanStateBadge, SpanStateNote, type SpanPresentationName } from "./span-state.js";

const VISIBLE: SpanPresentationName[] = ["edited", "edited-changed", "out-of-date"];

describe("SpanStateBadge / SpanStateNote", () => {
  it("renders nothing at all for the in-step state, which includes the deliberately silent cell", () => {
    const { container } = render(
      <>
        <SpanStateBadge presentation="in-step">should not appear</SpanStateBadge>
        <SpanStateNote presentation="in-step">should not appear</SpanStateNote>
      </>
    );
    expect(container.innerHTML).toBe("");
  });

  it.each(VISIBLE)("%s carries a word, so colour is never the only signal", (presentation) => {
    render(
      <SpanStateBadge presentation={presentation}>the badge words</SpanStateBadge>
    );
    expect(screen.getByText("the badge words")).toBeTruthy();
  });

  /**
   * **Amber is drift and only drift.** A hand edit whose blok has not moved is a choice somebody
   * made, not drift — this is the test the epic asks for, and it fails if `edited` ever picks up the
   * drift treatment.
   */
  it("gives the drift class only to the two states where the blok has changed", () => {
    for (const presentation of ["edited-changed", "out-of-date"] as const) {
      const { container } = render(<SpanStateBadge presentation={presentation}>x</SpanStateBadge>);
      expect(container.querySelector(".span-state-badge-drift"), presentation).not.toBeNull();
    }
    const { container } = render(<SpanStateBadge presentation="edited">x</SpanStateBadge>);
    expect(container.querySelector(".span-state-badge-drift"), "a hand edit is not drift").toBeNull();
  });

  it("agrees with isDriftPresentation, which is the single definition", () => {
    expect(isDriftPresentation("edited-changed")).toBe(true);
    expect(isDriftPresentation("out-of-date")).toBe(true);
    expect(isDriftPresentation("edited")).toBe(false);
    expect(isDriftPresentation("in-step")).toBe(false);
  });

  it("puts the action beside the sentence, so the reader can act where they are told", () => {
    render(
      <SpanStateNote presentation="edited" action={<button type="button">Update from blok</button>}>
        You wrote this span.
      </SpanStateNote>
    );
    expect(screen.getByText("You wrote this span.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Update from blok" })).toBeTruthy();
  });
});
