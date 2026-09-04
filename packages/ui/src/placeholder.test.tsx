import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Placeholder } from "./placeholder.js";

describe("Placeholder", () => {
  it("renders", () => {
    const { container } = render(<Placeholder />);
    expect(container.textContent).toBe("41Prompts UI");
  });
});
