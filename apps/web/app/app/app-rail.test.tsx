import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { railGroups } from "@/lib/app-shell/groups";
import { AppRail, initialsFor } from "./app-rail";

const SITE = "https://41prompts.ai";
const PROMPT = "pr_7893b994";
const PROJECT = "proj_027b";

function render(groupInput: Parameters<typeof railGroups>[0], current?: Parameters<typeof AppRail>[0]["current"]) {
  return renderToStaticMarkup(
    AppRail({
      groups: railGroups(groupInput),
      current,
      email: "engineer@northwind.io",
      siteHref: SITE,
      signOut: <button type="submit">Sign out</button>
    })
  );
}

/**
 * The rail is pure, so its **group set** — the one thing in EPIC-023 a screenshot cannot prove — is
 * assertable without a request, a database or a browser.
 */
describe("the rail's groups", () => {
  it("shows Workspace and Account, and no contextual group, on a route with no record", () => {
    const html = render({ siteOrigin: SITE }, "projects");
    expect(html).toContain("Workspace");
    expect(html).toContain("Account");
    expect(html).toContain("Projects");
    expect(html).toContain("Settings");
    // No record in context means no middle group at all — not an empty one.
    expect(html).not.toContain("Blok Editor");
    expect(html).not.toContain("Connect");
  });

  /**
   * **A prompt is inside a project, and the rail says both.** Two browser tests found the two holes
   * that showing only one contextual group leaves: opening Connect from a prompt swapped the
   * prompt's group away and stranded you, and from a prompt there was no route to the project at
   * all. Four groups, outermost first.
   */
  it("shows the project and the prompt, in that order, on a prompt route", () => {
    const html = render(
      {
        siteOrigin: SITE,
        promptId: PROMPT,
        promptName: "Refund classifier",
        promptProjectId: PROJECT,
        projectName: "Example project"
      },
      "runs"
    );
    const headings = [...html.matchAll(/class="app-rail-groupname">([^<]*)</g)].map((m) => m[1]);
    expect(headings).toEqual(["Workspace", "Example project", "Refund classifier", "Account"]);

    for (const name of ["Blok Editor", "Runs", "Versions", "Deploy", "Prompts", "Connect"]) {
      expect(html, name).toContain(name);
    }
    expect(html).toContain(`href="/app/p/${PROJECT}"`);
    expect(html).toContain(`href="/app/p/${PROJECT}/connect"`);
  });

  it("omits the project group when its name is not known, rather than heading one with undefined", () => {
    const html = render({ siteOrigin: SITE, promptId: PROMPT, promptName: "Refund classifier" });
    expect(html).toContain("Blok Editor");
    expect(html).not.toContain("Connect");
    expect(html).not.toContain("undefined");
  });

  it("shows the project group alone on a project route", () => {
    const html = render({ siteOrigin: SITE, projectId: PROJECT, projectName: "Example project" }, "connect");
    const headings = [...html.matchAll(/class="app-rail-groupname">([^<]*)</g)].map((m) => m[1]);
    expect(headings).toEqual(["Workspace", "Example project", "Account"]);
    expect(html).toContain(`href="/app/p/${PROJECT}/connect"`);
    expect(html).not.toContain("Blok Editor");
  });

  /**
   * Stage 7 owns the lesson engine and nothing renders at `/app/lessons`. EPIC-016 refused a site
   * nav link to a page that does not exist; the reasoning is identical one host over.
   */
  it("has no Lessons item", () => {
    const html = render({ siteOrigin: SITE, promptId: PROMPT, promptName: "P", promptProjectId: PROJECT });
    expect(html).not.toContain("Lessons");
    expect(html).not.toContain("/app/lessons");
  });

  it("points Import at the public decompiler on the site's own host", () => {
    expect(render({ siteOrigin: SITE })).toContain(`href="${SITE}/decompile"`);
  });
});

describe("the rail's markup", () => {
  /**
   * The mockup uses `<button data-app="runs">` because it is a prototype with a JavaScript router.
   * Every rail item navigates, and EPIC-055 settled the general case: a control that changes the
   * URL is a link. The only `<button>` the rail may contain is the sign-out submit.
   */
  it("navigates with links, never buttons", () => {
    const html = render({
      siteOrigin: SITE,
      promptId: PROMPT,
      promptName: "Refund classifier",
      promptProjectId: PROJECT
    });
    const buttons = html.match(/<button/g) ?? [];
    expect(buttons).toHaveLength(1);
    expect(html).toContain("Sign out");
  });

  it("marks exactly one item current, with aria-current=page", () => {
    const html = render(
      { siteOrigin: SITE, promptId: PROMPT, promptName: "P", promptProjectId: PROJECT },
      "versions"
    );
    expect(html.match(/aria-current="page"/g) ?? []).toHaveLength(1);
    // `aria-current="true"` is what the mockup writes and is not valid on a link.
    expect(html).not.toContain('aria-current="true"');
  });

  it("marks nothing current on a route the rail does not name", () => {
    const html = render({ siteOrigin: SITE, promptId: PROMPT, promptName: "P", promptProjectId: PROJECT });
    expect(html).not.toContain("aria-current");
  });

  /** The label beside each icon is the accessible name; an icon that also had one would double it. */
  it("hides every icon from assistive technology", () => {
    const html = render({ siteOrigin: SITE });
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) expect(svg, svg).toContain('aria-hidden="true"');
  });

  /**
   * The mockup's foot reads `Pro · 4,120 runs left`. There are no plans until EPIC-070 and no run
   * budget is enforced anywhere, so both would be inventions.
   */
  it("shows the email and claims no plan or quota", () => {
    const html = render({ siteOrigin: SITE });
    expect(html).toContain("engineer@northwind.io");
    expect(html).not.toMatch(/\bPro\b|\bruns left\b|\bFree\b|\bTeam\b/);
  });

  /** A record's name is user input. It is text, never markup. */
  it("escapes a name that looks like markup", () => {
    const html = render({
      siteOrigin: SITE,
      promptId: PROMPT,
      promptName: '<img src=x onerror="alert(1)">',
      promptProjectId: PROJECT
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });
});

describe("initialsFor", () => {
  it.each([
    ["engineer@northwind.io", "E"],
    ["Soroush@example.com", "S"],
    ["  ada@example.com", "A"]
  ])("%s → %s", (email, expected) => {
    expect(initialsFor(email)).toBe(expected);
  });

  /**
   * Sign-in is a magic link and nothing asks for a name, so the email is the only identity there
   * is. A local part starting with a digit or a symbol renders a neutral mark rather than a
   * character that reads like an initial and is not one.
   */
  it.each(["1password@example.com", ".hidden@example.com", "@example.com", ""])(
    "falls back to a neutral mark for %s",
    (email) => {
      expect(initialsFor(email)).toBe("·");
    }
  );
});
