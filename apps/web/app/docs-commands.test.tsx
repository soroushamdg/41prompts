import { COMMANDS } from "@41prompts/cli";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

/**
 * The Docs page names commands, and a command is an identifier rather than a claim, so it is not in
 * `lib/site/claims.ts`. This is what pins it instead.
 *
 * **Two of the mockup's commands do not exist**, and both were on the page it draws:
 * `npx 41prompts run` — which is neither the package name nor a command that behaves as drawn, since
 * `41p run` calls no model (EPIC-053 §8) — and `npm install 41prompts`, which installs nothing,
 * because the packages are `@41prompts/sdk` and `@41prompts/cli`. A page that teaches somebody a
 * command that does not work costs them the twenty minutes before they give up.
 */

vi.mock("@/app/site-chrome", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/site-chrome")>();
  return { ...actual, SiteNavWithSession: () => actual.SiteNav({ signedIn: false }) };
});

const { default: Docs } = await import("./docs/page.js");
const { default: Delivery } = await import("./delivery/page.js");

const docsHtml = renderToStaticMarkup(<Docs />);
const deliveryHtml = renderToStaticMarkup(<Delivery />);
const both = `${docsHtml}\n${deliveryHtml}`;

describe("the docs page names the CLI's real commands", () => {
  it("names every one of them", () => {
    expect(COMMANDS.length).toBeGreaterThan(0);
    for (const command of COMMANDS) expect(docsHtml, `41p ${command} is not on the page`).toContain(`41p ${command}`);
  });

  it("names no command the CLI does not have", () => {
    const named = [...docsHtml.matchAll(/41p ([a-z][a-z-]*)/g)].map((match) => match[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const command of named) {
      expect((COMMANDS as readonly string[]).includes(command), `41p ${command} is not a command`).toBe(true);
    }
  });

  it("would notice a command that does not exist", () => {
    expect((COMMANDS as readonly string[]).includes("deploy")).toBe(false);
  });
});

describe("the install lines are the packages that exist", () => {
  it.each(["npm install @41prompts/sdk", "pip install fortyone-prompts"])("shows %s", (line) => {
    expect(both).toContain(line);
  });

  /**
   * The mockup's own lines, refused.
   *
   * `41prompts` is not a package on npm; `@41prompts/sdk` is. And `npx 41prompts run` is the command
   * that led EPIC-053's report to say, in as many words, that narrowing the roadmap's word is better
   * than delivering something that resembles it.
   */
  it.each(["npm install 41prompts", "npx 41prompts run", "npx 41prompts"])("does not show %s", (wrong) => {
    expect(both).not.toContain(wrong);
  });

  it("does not describe 41p run as something that calls a model", () => {
    expect(docsHtml).toContain("calls no model");
  });
});
