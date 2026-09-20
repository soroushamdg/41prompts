import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ProjectListItem } from "@/lib/canvas/queries";
import { ProjectCard } from "./project-card";

const base: ProjectListItem = {
  id: "proj_027b",
  name: "Refunds",
  slug: "refunds",
  prompts: 3,
  metrics: {}
};

const render = (project: Partial<ProjectListItem>) =>
  renderToStaticMarkup(<ProjectCard project={{ ...base, ...project }} />);

describe("a project card", () => {
  it("links to the project and counts its prompts", () => {
    const html = render({});
    expect(html).toContain('href="/app/p/proj_027b"');
    expect(html).toContain("Refunds");
    expect(html).toContain("3 prompts");
  });

  it("says one prompt in the singular", () => {
    expect(render({ prompts: 1 })).toContain("1 prompt");
    expect(render({ prompts: 1 })).not.toContain("1 prompts");
  });

  /**
   * The mockup draws all three numbers on all six of its cards because all six are invented. A
   * project that has never been run has none of them, and `0%` beside `$0.00` reads as *this was
   * run and it went badly*.
   */
  it("prints an em dash for a project that has never been run, never a zero", () => {
    const html = render({ metrics: {} });
    expect(html.match(/—/g) ?? []).toHaveLength(3);
    expect(html).not.toContain("0.0%");
    expect(html).not.toContain("$0.00");
  });

  it("prints the three numbers when they exist", () => {
    const html = render({ metrics: { runs: 482, costCents: 37, passRate: 0.817 } });
    expect(html).toContain("81.7%");
    expect(html).toContain("482");
    expect(html).toContain("$0.37");
    expect(html).not.toContain("—");
  });

  /**
   * EPIC-030's third outcome, carried all the way to the card. A run that graded nothing is not a
   * run that scored zero, and it is not a project that has never been run either — so it borrows
   * neither the figure nor the em dash.
   */
  it("says not graded when a run finished and nothing could be graded", () => {
    const html = render({ metrics: { runs: 1, costCents: 2, passRate: null } });
    expect(html).toContain("not graded");
    expect(html).not.toContain("0.0%");
    expect(html).not.toContain("—");
  });

  /**
   * Rule 10: pass/fail is never shown by colour alone. The tone is an attribute on the figure, so
   * the figure is always the signal and the tint only ever follows it.
   */
  it.each([
    [0.991, "pass"],
    [0.964, "pass"],
    [0.84, "drift"],
    [0.62, "fail"]
  ])("tones %s as %s, with the figure still printed", (rate, tone) => {
    const html = render({ metrics: { runs: 1, costCents: 1, passRate: rate } });
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(`${(rate * 100).toFixed(1)}%`);
  });

  it("puts no tone on anything but the pass rate", () => {
    const html = render({ metrics: { runs: 482, costCents: 37, passRate: 0.62 } });
    expect(html.match(/data-tone=/g) ?? []).toHaveLength(1);
  });

  /** A project name is user input. It is text, never markup. */
  it("escapes a name that looks like markup", () => {
    const html = render({ name: '<img src=x onerror="alert(1)">' });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  /**
   * The heading is the link, and the card is not. A link wrapping the metric row would fold every
   * number into the link's accessible name.
   */
  it("has exactly one link, and it is the heading", () => {
    const html = render({ metrics: { runs: 1, costCents: 1, passRate: 1 } });
    expect(html.match(/<a /g) ?? []).toHaveLength(1);
    expect(html).toMatch(/<h2[^>]*><a /);
  });
});
