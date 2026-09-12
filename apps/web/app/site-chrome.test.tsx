import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SiteNav } from "./site-chrome";

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
