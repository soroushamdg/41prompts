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

  /**
   * EPIC-016d: the mockup's nav, minus the destinations that do not exist.
   *
   * The mockup's row is Product · Features · Delivery · Pricing · Learn · Docs. **`Pricing` joined
   * in EPIC-070**, which built the page it points at; `Learn` needs Stage 7 and EPIC-016's rule — *a
   * nav link to a 404 is worse than no nav* — still holds for it, so it is still absent. Everything
   * else is here, in the mockup's order, with `Decompiler` last because it is ours and the mockup
   * has no place for it.
   */
  it("opens with Product, in the mockup's order", () => {
    const html = renderToStaticMarkup(SiteNav({ signedIn: false }));
    const names = [...html.matchAll(/class="site-nav-link"[^>]*>([^<]+)</g)].map((m) => m[1]);
    expect(names).toEqual(["Product", "Features", "Delivery", "Pricing", "Docs", "Decompiler"]);
  });

  it("marks Product as the current page on the home page, and nowhere else", () => {
    expect(renderToStaticMarkup(SiteNav({ signedIn: false, current: "home" }))).toMatch(
      /aria-current="page"[^>]*>Product</
    );
    // The control: the attribute is not simply always there. On another page Product is a plain
    // link, which is the defect `SiteNavCurrent`'s own comment was written about — a derived value
    // that is silently never equal produces a nav that never marks itself.
    expect(renderToStaticMarkup(SiteNav({ signedIn: false, current: "docs" }))).not.toMatch(
      /aria-current="page"[^>]*>Product</
    );
  });

  /**
   * **`Pricing` was on this list until EPIC-070 built the page**, and it came off the day it did.
   * That is the rule working rather than the rule weakening: the rule is *no nav link to a 404*, so
   * an entry leaves this assertion at exactly the moment its route starts answering. `Learn` stays,
   * because Stage 7 has not happened.
   */
  it("still links Learn nowhere, because that page does not exist", () => {
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(SiteNav({ signedIn }));
      expect(html).not.toContain(">Learn<");
    }
  });

  it("links Pricing, now that the page answers", () => {
    for (const signedIn of [true, false]) {
      const html = renderToStaticMarkup(SiteNav({ signedIn }));
      expect(html).toContain('href="/pricing"');
    }
  });

  /**
   * "Start free", and the one thing the mockup could not decide because a prototype has no sessions.
   *
   * It is the primary, it is the mockup's, and it renders **only when signed out**. Offering it to
   * somebody who already has an account invites a second one; a signed-in reader gets
   * "Go to dashboard" in its place, and there is exactly one primary on the row either way.
   */
  it("offers Start free to a visitor with no session, as the primary", () => {
    const html = renderToStaticMarkup(SiteNav({ signedIn: false }));
    expect(html).toMatch(/class="btn btn-sm btn-pri"[^>]*>Start free</);
    expect(html).toContain(`href="${APP_ORIGIN}/sign-up"`);
  });

  it("does not offer Start free to somebody who already has an account", () => {
    const html = renderToStaticMarkup(SiteNav({ signedIn: true }));
    expect(html).not.toContain("Start free");
    expect(html).not.toContain("/sign-up");
  });

  it("shows exactly one primary button, in both session states", () => {
    for (const signedIn of [true, false]) {
      const primaries = renderToStaticMarkup(SiteNav({ signedIn })).match(/btn-pri/g) ?? [];
      expect(primaries.length, `signedIn=${signedIn}`).toBe(signedIn ? 0 : 1);
    }
  });

  it("dresses Sign in and Go to dashboard as bordered buttons, and keeps them links", () => {
    // The mockup draws `.btn.sm`. They navigate, so they stay `<a>` — the same trade the closing
    // band's `.cta-band-link` already makes, and the reason neither is a `<button>` with an onClick.
    expect(renderToStaticMarkup(SiteNav({ signedIn: false }))).toMatch(/<a class="btn btn-sm"[^>]*>Sign in</);
    expect(renderToStaticMarkup(SiteNav({ signedIn: true }))).toMatch(/<a class="btn btn-sm"[^>]*>Go to dashboard</);
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
