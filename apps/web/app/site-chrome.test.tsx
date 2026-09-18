import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SiteFooter, SiteNav } from "./site-chrome";

const APP_ORIGIN = "https://app.41prompts.ai";
const original = process.env.BETTER_AUTH_URL;

beforeEach(() => {
  process.env.BETTER_AUTH_URL = APP_ORIGIN;
});
afterEach(() => {
  if (original === undefined) delete process.env.BETTER_AUTH_URL;
  else process.env.BETTER_AUTH_URL = original;
});

/**
 * The nav's session state is decided on the server, so it is renderable — and assertable — without a
 * browser. That is the point: an effect-driven version would have to be tested by watching for a
 * flash, which is to say by watching for the bug.
 */
describe("the landing nav", () => {
  it("offers the dashboard when a session exists", () => {
    const html = renderToStaticMarkup(SiteNav({ signedIn: true }));
    expect(html).toContain("Go to dashboard");
    expect(html).toContain(`href="${APP_ORIGIN}/app"`);
    expect(html).not.toContain("Sign in");
  });

  it("offers sign-in when none does", () => {
    const html = renderToStaticMarkup(SiteNav({ signedIn: false }));
    expect(html).toContain("Sign in");
    expect(html).toContain(`href="${APP_ORIGIN}/sign-in"`);
    expect(html).not.toContain("Go to dashboard");
  });

  it("shows exactly one of them, never both and never neither", () => {
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(SiteNav({ signedIn }));
      const count = Number(html.includes("Go to dashboard")) + Number(html.includes("Sign in"));
      expect(count, `signedIn=${signedIn}`).toBe(1);
    }
  });

  it("sends both links to the app host, not to a path on the apex", () => {
    // A relative /app or /sign-in on the apex would only 301 across anyway. A link that visibly goes
    // where it says beats a tidy href plus a redirect.
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(SiteNav({ signedIn }));
      expect(html).not.toMatch(/href="\/(?:app|sign-in)"/);
    }
  });

  it("always offers the decompiler, signed in or out", () => {
    for (const signedIn of [true, false]) {
      expect(renderToStaticMarkup(SiteNav({ signedIn }))).toContain('href="/decompile"');
    }
  });
});

/**
 * The footer's copyright line, which did not exist until 2026-09-18.
 *
 * EPIC-016 drew it from the mockup and left it out; EPIC-017 left it out again. Both had the same
 * reason and it was a good one: `CLAUDE.md` named the holder `<legal ${"entity"}>` "until
 * incorporation", and a © naming a company that does not exist is a claim the product does not get
 * to make. `packages/ui/src/landing.css` has carried `.site-foot-legal` unused ever since.
 *
 * EPIC-056 is the epic where the company exists, so the line arrives with it. These assertions are
 * what stops it from quietly going away again, and what stops it naming the brand instead of the
 * holder — `41Prompts` is a name, `41Prompts Inc.` is who owns the copyright, and only the second
 * one is what a © is for.
 */
describe("the landing footer", () => {
  it("names the copyright holder, not just the brand", () => {
    const html = renderToStaticMarkup(SiteFooter());
    expect(html).toContain("© 2026 41Prompts Inc.");
  });

  it("uses the class the design system already reserved for it", () => {
    expect(renderToStaticMarkup(SiteFooter())).toContain('class="site-foot-legal"');
  });

  it("carries no placeholder where the holder should be", () => {
    expect(renderToStaticMarkup(SiteFooter())).not.toContain(`<legal ${"entity"}>`);
  });
});
