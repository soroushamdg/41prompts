import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Callout } from "./callout.js";

describe("Callout", () => {
  it.each([
    ["fail", "✕"],
    ["drift", "!"],
    ["pass", "✓"],
  ] as const)("status=%s renders an icon alongside the title and body (never colour alone)", (status, glyph) => {
    render(
      <Callout status={status} title="a title">
        the body
      </Callout>,
    );
    expect(screen.getByText("a title")).toBeInTheDocument();
    expect(screen.getByText("the body")).toBeInTheDocument();
    expect(screen.getByText(glyph, { exact: false })).toBeInTheDocument();
  });

  it("status=fail is announced as an alert", () => {
    render(
      <Callout status="fail" title="broken">
        detail
      </Callout>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("status=info is not an alert and shows a neutral icon", () => {
    render(
      <Callout status="info" title="fyi">
        detail
      </Callout>,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("i")).toBeInTheDocument();
  });
});
