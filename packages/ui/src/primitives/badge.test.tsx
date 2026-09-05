import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge.js";

describe("Badge", () => {
  it.each([
    ["pass", "✓"],
    ["fail", "✕"],
    ["drift", "!"],
  ] as const)("status=%s renders both an icon and visible text (decision 3 — never colour alone)", (status, glyph) => {
    render(<Badge status={status}>label text</Badge>);
    const badge = screen.getByText("label text").closest(".badge");
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain(glyph);
    expect(badge?.textContent).toContain("label text");
    // the glyph is aria-hidden — the accessible name comes from the text, not the icon
    expect(badge?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it("status=neutral renders text only, no status glyph", () => {
    render(<Badge status="neutral">n/a</Badge>);
    const badge = screen.getByText("n/a").closest(".badge");
    expect(badge?.querySelector(".status-icon")).toBeNull();
  });
});
