import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { routeContext } from "@/lib/app-shell/context";
import { crumbsFor } from "@/lib/app-shell/crumbs";
import { AppTopBar, type AppTopBarProps } from "./app-topbar";

const NAMES = { promptName: "Refund classifier", promptProjectId: "proj_027b" };

function render(overrides: Partial<AppTopBarProps> = {}) {
  return renderToStaticMarkup(
    AppTopBar({
      crumbs: crumbsFor(routeContext("/app/pr/pr_7893b994/runs"), NAMES),
      siteHref: "https://41prompts.ai",
      menu: null,
      ...overrides
    })
  );
}

describe("the top bar", () => {
  it("renders the trail with the last segment marked current and not linked", () => {
    const html = render();
    expect(html).toContain("Refund classifier");
    expect(html).toContain('<span aria-current="page">Runs</span>');
    expect(html).toContain('href="/app/pr/pr_7893b994"');
  });

  /** A `/` typed into the markup is a character a screen reader announces between every segment. */
  it("does not type the separator into the markup", () => {
    expect(render()).not.toContain("</li>/");
  });

  it("names the trail for assistive technology without becoming a second heading", () => {
    const html = render();
    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).not.toContain("<h1");
  });

  /**
   * `docs/design/README.md` corrects the mockup on both counts: the words are `Draft v7` and
   * `Live v6`, and amber means drift only — so there is no dot and no amber here.
   *
   * **Scoped to the pill, not the document.** The first version of this asserted the whole markup
   * did not match `/unsaved|current|drift/i` and failed on `aria-current="page"` — a pattern broad
   * enough to catch a correct attribute is a pattern that will be narrowed until it catches
   * nothing. The control below is what keeps this one honest.
   */
  const pillText = (html: string) => html.match(/<span class="pill">([^<]*)<\/span>/)?.[1];

  it("says the version state in the corrected vocabulary", () => {
    const html = render({ versionState: "Draft v7 · Live v6" });
    expect(pillText(html)).toBe("Draft v7 · Live v6");
    expect(pillText(html)).not.toMatch(/unsaved|current|drift/i);
  });

  it("would still catch the mockup's own wording", () => {
    expect(pillText(render({ versionState: "v7 · unsaved" }))).toMatch(/unsaved/i);
  });

  it("shows no pill when no prompt is in context", () => {
    const html = render({ crumbs: crumbsFor(routeContext("/app/projects"), {}) });
    expect(html).not.toContain("pill");
  });

  it("offers the primary action only when there is a prompt to run", () => {
    expect(render({ primaryAction: { name: "Run suite", href: "/app/pr/pr_7893b994/runs" } })).toContain(
      "Run suite"
    );
    expect(render()).not.toContain("Run suite");
  });

  it("links back to the public site absolutely, because it is another host", () => {
    expect(render()).toContain('href="https://41prompts.ai"');
  });
});
