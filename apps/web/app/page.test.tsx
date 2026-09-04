import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Page from "./page.js";

describe("/", () => {
  it("renders 41Prompts", () => {
    const html = renderToStaticMarkup(Page());
    expect(html).toContain("41Prompts");
  });
});
