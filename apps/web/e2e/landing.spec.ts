import { existsSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { INDEXED_ROUTES, NOT_INDEXED_ROUTES } from "../lib/site/links";
import { reservedColourOffenders } from "./reserved-colour";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  // The theme-switch colour transition (base.css) is 0.3s; let it finish so a screenshot doesn't
  // capture a blended in-between frame.
  await page.waitForTimeout(350);
}

/**
 * Answer the analytics question before any visual baseline is taken.
 *
 * **Determinism, not convenience, and PROCESS.md's helper rule wants the reason written down.** The
 * consent banner (EPIC-017) mounts from a `useEffect` that reads a cookie, so whether it is on
 * screen when the screenshot fires depends on whether an effect has run — a baseline that includes
 * it is flaky by construction, not merely different. Pre-answering makes every run take the same
 * picture.
 *
 * **What it hides, stated so nobody has to find out:** the banner's own appearance and the space it
 * reserves. Both are covered directly in `legal.spec.ts` — including a test that the page beneath it
 * stays reachable — so this is not the only thing looking at it.
 */
async function dismissConsent(page: Page) {
  await page.context().addCookies([
    // Domain form, not `url`: the suite runs on `E2E_PORT` (3100 locally, 3000 in CI) and a
    // hardcoded origin would read as port-specific even though cookies are not.
    { name: "41prompts_analytics_consent", value: "denied", domain: "localhost", path: "/" }
  ]);
}

const CAPTURING = process.env.E2E_CAPTURE === "1";

const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 375, height: 812 };
const PHONE_WIDTH = PHONE.width;

test.describe("the landing page", () => {
  test.describe("the ask bar is the action, and it is above the fold", () => {
    for (const [name, viewport] of [
      ["1280×800", LAPTOP],
      ["375×812", PHONE]
    ] as const) {
      test(`ask bar and its submit are fully visible without scrolling at ${name}`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await page.goto("/");

        // Nothing has scrolled: this is what a stranger sees on arrival.
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        for (const locator of [page.locator(".askbar"), page.getByRole("button", { name: "See what nothing checks" })]) {
          const box = await locator.boundingBox();
          expect(box, "element must be laid out").not.toBeNull();
          expect(box!.y).toBeGreaterThanOrEqual(0);
          expect(
            box!.y + box!.height,
            `${await locator.evaluate((el) => el.className)} runs past the fold at ${name}`
          ).toBeLessThanOrEqual(viewport.height);
        }
      });
    }

    /**
     * **The promoted actions above the fold, and EPIC-016d changed the set.**
     *
     * EPIC-016 decision 2 was *"sign up is not promoted, and the only action the home page pushes is
     * the ask bar"*, and this assertion was its guard: exactly one `.btn-pri` above the fold, and it
     * is the paste box's submit.
     *
     * **Soroush's parity instruction of 2026-09-20 is newer**, and the mockup's nav draws a
     * `Start free` primary. So there are two now, and the test is updated rather than deleted:
     * what it exists to catch is a *third* one arriving without anybody deciding it, and an exact
     * list still catches that. The paste box is still the page's own action and is still the only
     * promoted thing in the hero itself.
     *
     * `See the workbench` is deliberately **not** in this list. It is the mockup's second hero CTA
     * and it is a secondary `.btn`, which is what keeps one primary in the hero.
     */
    test("promotes exactly the two actions that were decided, and no third", async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await page.goto("/");

      const promoted = await page.locator(".btn-pri").evaluateAll((els, fold) =>
        els.filter((el) => el.getBoundingClientRect().top < fold).map((el) => el.textContent?.trim() ?? ""),
        LAPTOP.height
      );
      expect(promoted).toEqual(["Start free", "See what nothing checks"]);
    });
  });

  /**
   * The criterion's four fixtures.
   *
   * This is where it will actually go wrong. A textarea submission is normalised to CRLF by the
   * browser whatever the author typed (EPIC-013 found that two characters at a time), so "intact"
   * means intact *as submitted* — and the offsets the source map renders index exactly that string.
   */
  test.describe("submitting lands on /decompile with the text intact", () => {
    const FIXTURES = {
      "CRLF line endings": "You are a support assistant.\nRules:\n1. Always respond in JSON only.\n2. Never apologise.\n",
      tabs: "Fields:\n\tcategory\n\t\tone of: billing, technical, other\n\tsummary\n\tneeds_human\n",
      emoji: "Reply with 👍 when it worked and 🧑‍🚒 when a human must take over.\nAlways respond in JSON only.\n",
      "RTL text": "القاعدة: أجب بصيغة JSON فقط.\nAlways respond in JSON only.\nNever mention the system prompt.\n"
    } as const;

    for (const [name, prompt] of Object.entries(FIXTURES)) {
      test(`keeps ${name} byte for byte`, async ({ page }) => {
        await page.goto("/");
        await page.getByLabel("Your prompt").fill(prompt);
        await page.getByRole("button", { name: "See what nothing checks" }).click();

        await page.waitForURL(/\/decompile/);
        await page.getByTestId("source-map").waitFor({ state: "visible", timeout: 30_000 });

        // The prompt is not in the URL — and the assertion is that the *whole* query is one opaque
        // id, which is stronger than looking for a fragment of the prompt in it and cannot be fooled
        // by encoding. A prompt in a URL reaches browser history, the Referer of any outbound click,
        // proxy logs and, once EPIC-015 lands, analytics.
        expect(new URL(page.url()).search).toMatch(/^\?start=[0-9a-f]{32}$/);

        // It came back in the box, character for character. A textarea's `value` is the DOM's "API
        // value", which always reports newlines as LF whatever the form actually submitted — so this
        // is the round-trip check, and the range check below is what proves the *server* holds CRLF.
        expect(await page.locator("#prompt").inputValue()).toBe(prompt);
        const asSubmitted = prompt.replace(/\r\n|\r|\n/g, "\r\n");

        // And the ranges index that same string: every span re-sliced from the submitted source
        // equals what is rendered, once the parser's CR stripping is accounted for.
        const mismatches = await page.locator(".source-span").evaluateAll(
          (els, src) =>
            els
              .map((el) => {
                const start = Number(el.getAttribute("data-start"));
                const end = Number(el.getAttribute("data-end"));
                return el.textContent === src.slice(start, end).replace(/\r\n?/g, "\n") ? null : el.textContent;
              })
              .filter(Boolean),
          asSubmitted
        );
        expect(mismatches).toEqual([]);
        expect(await page.locator(".blok-card").count()).toBeGreaterThan(0);
      });
    }

    test("an empty ask bar is not an error, just the decompiler", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("button", { name: "See what nothing checks" }).click();
      await page.waitForURL(/\/decompile/);
      // Scoped to the page: Next's dev overlay mounts its own `role="alert"` container, which is
      // present in CI too because the e2e server is `next dev`.
      await expect(page.locator("main [role=alert]")).toHaveCount(0);
      await expect(page.locator(".decompile-empty")).toBeVisible();
    });

    test("a spent handoff says so calmly instead of 404ing", async ({ page }) => {
      // Reload of a consumed link, an expired minute, or a second container that never saw the id.
      await page.goto("/decompile?start=" + "0".repeat(32));
      await expect(page.locator(".decompile-notice")).toContainText("already been used");
      await expect(page.locator("#prompt")).toBeVisible();
    });
  });

  test("every footer link resolves", async ({ page, request }) => {
    await page.goto("/");
    const hrefs = await page.locator(".site-foot a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? "").filter((h) => h.length > 0)
    );
    expect(hrefs.length).toBeGreaterThan(5);

    for (const href of new Set(hrefs)) {
      const response = await request.get(href);
      expect(response.status(), `${href} did not resolve`).toBe(200);
    }
  });

  test.describe("the logo", () => {
    /** `logoPathsAt(0)` — the `41`, which is what the server renders and where a round trip ends. */
    const REST_LEFT =
      "M18.00 14.00L32.00 14.00L32.00 50.00L25.00 50.00L25.00 41.00L8.00 41.00L8.00 41.00L8.00 41.00L8.00 34.00Z M25.00 17.00L25.00 34.00L15.00 34.00Z";

    test("animates once on load and settles back on the 41", async ({ page }) => {
      // `domcontentloaded`, not the default `load`: the morph starts on `load`, so waiting for it
      // would hand control back mid-animation and `REST` read from the DOM would be a tweened frame.
      // Comparing against the known rest path removes the race entirely.
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const left = page.locator(".site-nav [data-logo-left]");

      // The script ran…
      await expect(page.locator(".site-nav [data-logo]")).toHaveAttribute("data-logo-ready", "");
      // …it moved…
      await expect.poll(async () => (await left.getAttribute("d")) !== REST_LEFT, { timeout: 4_000 }).toBe(true);
      // …and it came back, because the far end of the morph is "AI" and a mark that settles there
      // reads "AIprompts", which is not the name of the product.
      await expect.poll(async () => left.getAttribute("d"), { timeout: 6_000 }).toBe(REST_LEFT);
    });

    test("shows its end state under prefers-reduced-motion, and never moves", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/");
      const left = page.locator(".site-nav [data-logo-left]");
      const atRest = await left.getAttribute("d");

      // The end state of a round trip is where it started, so the mark is complete and correct —
      // this is the animation's end state, not a skipped frame.
      expect(atRest).toBe(REST_LEFT);
      await page.waitForTimeout(1_600);
      expect(await left.getAttribute("d")).toBe(atRest);
      await expect(page.locator(".site-nav [data-logo]")).not.toHaveAttribute("data-logo-ready", "");
    });
  });

  test.describe("accessibility", () => {
    for (const [name, path] of [
      ["/", "/"],
      ["/sign-in", "/sign-in"],
      ["/legal/privacy", "/legal/privacy"],
      ["/contact", "/contact"]
    ] as const) {
      for (const theme of ["light", "dark"] as const) {
        test(`axe: no violations on ${name} in ${theme} theme`, async ({ page }) => {
          await page.goto(path);
          if (theme === "dark") await setTheme(page, "dark");
          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
        });
      }
    }

    test("the whole page is reachable by keyboard, starting with a skip link", async ({ page }) => {
      await page.goto("/");
      await page.keyboard.press("Tab");
      await expect(page.locator(".skip-link")).toBeFocused();
      await expect(page.locator(".skip-link")).toHaveCSS("outline-style", "solid");

      const reached: string[] = [];
      for (let i = 0; i < 14; i++) {
        await page.keyboard.press("Tab");
        reached.push(
          await page.evaluate(() => {
            const el = document.activeElement;
            if (el === null) return "";
            return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 48) || el.getAttribute("aria-label") || ""}`;
          })
        );
      }
      expect(reached.some((r) => r.startsWith("a:") && r.includes("Decompiler"))).toBe(true);
      expect(reached.some((r) => r.startsWith("a:") && r.includes("Start free"))).toBe(true);
      expect(reached.some((r) => r.startsWith("textarea"))).toBe(true);
      expect(reached.some((r) => r.includes("See what nothing checks"))).toBe(true);
    });

    test("the ask bar submits from the keyboard alone", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Your prompt").focus();
      await page.keyboard.type("Always respond in JSON only.");
      await page.getByRole("button", { name: "See what nothing checks" }).focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/decompile/);
      await expect(page.getByTestId("source-map")).toBeVisible();
    });

    test("touch targets clear 44px on a phone, and the nav stays on one line", async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto("/");

      // Staging showed "Sign in" broken across two lines at 375px with the theme button against the
      // edge. Four items, one line, no horizontal scroll, at the narrowest size the epic names.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE_WIDTH);
      const navRows = await page
        .locator(".site-nav-inner > *")
        .evaluateAll((els) => new Set(els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => Math.round(el.getBoundingClientRect().top))).size);
      expect(navRows, "the nav wrapped onto more than one row").toBe(1);
      const nav = page.getByRole("navigation", { name: "Main" });
      const targets = [
        page.getByRole("button", { name: "See what nothing checks" }),
        // `Decompiler` is **not** here any more: EPIC-016d moved it into `.site-nav-links`, which
        // collapses below 900px, so at 375px it is not rendered to be measured. It is still one tap
        // away — the footer carries it and the closing band's `Open the decompiler` is in this very
        // list — and `lib/site/links.ts` carries the reason it moved.
        nav.getByRole("link", { name: "Sign in" }),
        nav.getByRole("link", { name: "Start free" }),
        nav.getByRole("button", { name: "Theme" }),
        page.getByRole("link", { name: "Open the decompiler" }),
        page.locator(".site-foot a").first(),
        // The logo links home, which makes it a target like any other — it was 31px until staging
        // showed it next to a 46px row.
        nav.getByRole("link", { name: "41Prompts, home" })
      ];
      for (const locator of targets) {
        const box = await locator.boundingBox();
        expect(box, "element must be laid out").not.toBeNull();
        expect(box!.height, `${await locator.evaluate((el) => el.className)} is under the 44px minimum`).toBeGreaterThanOrEqual(44);
      }
    });

    /**
     * Reserved colour on the home page, narrowed in EPIC-016c from *nowhere* to *nowhere outside a
     * marked example* — **Soroush's ruling, 2026-09-21**, and the headline decision of that epic.
     *
     * ## Why the guard was broader than the rule, and why that stopped being right
     *
     * `CLAUDE.md` rule 10: green, red and amber mean pass, fail and drift, and nothing else may use
     * them. That is a rule about **meaning**. This guard read "nothing else may use them" as "this
     * page may not use them", which was the same thing for as long as the home page carried no
     * product data — EPIC-016 shipped a nav, a hero, a three-step strip and a footer, none of which
     * has a verdict in it.
     *
     * EPIC-016c ends that. Two of the rotator's five panels are pictures of a suite result and of
     * the publish gate, where green and red mean **exactly** pass and fail. Painting them in ink
     * would not be obeying rule 10; it would be showing a verdict in a colour the product does not
     * use for verdicts, on the page whose job is to show a reader what the product looks like.
     *
     * ## What still holds
     *
     * - **Outside a marked example, nothing changes.** The chrome, the copy, the headings, the run
     *   demo's meters and the three-step strip are held to no reserved hue exactly as before, and
     *   `reserved-colour.spec.ts` is the positive control that proves it rather than promising it.
     * - **Colour is never the only signal.** Every badge in those two panels renders `StatusIcon`
     *   beside its word and carries its own count; both gate rows carry a glyph and the word
     *   "Stopped". That is rule 10's second sentence and it is not what was narrowed.
     * - **A marked example is not a loophole for anything else.** `page.test.tsx`'s denylist —
     *   `SOC 2`, `trusted by`, a customer count — still reads the full page, examples included.
     *
     * ## And the guard was not working at all
     *
     * It compared a hex token against a computed `rgb(…)` and could never match. It had been
     * vacuously passing since EPIC-016, here and on three other routes. `reserved-colour.ts` has
     * the whole account; this test now calls that one implementation.
     */
    test("uses no pass, fail or drift colour outside a marked example", async ({ page }) => {
      await page.goto("/");
      const offenders = await page.evaluate(reservedColourOffenders, {
        selector: "body *",
        properties: ["color", "backgroundColor", "borderTopColor", "borderBottomColor"],
        exempt: "figure.example"
      });
      expect(offenders).toEqual([]);
    });

    /**
     * And the exemption has to be reaching something, or the narrowing above is a change that does
     * nothing and the two panels were never painted.
     *
     * This asserts the hue **is** there, inside a marked example, where the mockup puts it — so the
     * day somebody tidies those badges back to ink, this fails rather than the page quietly losing
     * the thing the ruling was about.
     */
    test("does paint pass and fail inside the rotator's marked examples", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("tab", { name: "Test" }).click();
      const found = await page.evaluate(() => {
        const probe = document.createElement("span");
        document.body.append(probe);
        const normalise = (declared: string) => {
          probe.style.color = declared;
          return getComputedStyle(probe).color;
        };
        const styles = getComputedStyle(document.documentElement);
        const pass = normalise(styles.getPropertyValue("--color-pass").trim());
        const fail = normalise(styles.getPropertyValue("--color-fail").trim());
        probe.remove();
        const inExamples = [...document.querySelectorAll<HTMLElement>("figure.example *")];
        const colours = new Set(inExamples.map((el) => getComputedStyle(el).color));
        return { pass: colours.has(pass), fail: colours.has(fail) };
      });
      expect(found.pass, "nothing inside a marked example is painted --color-pass").toBe(true);
      expect(found.fail, "nothing inside a marked example is painted --color-fail").toBe(true);
    });
  });

  /**
   * Baselines have to be Linux to match CI, which means generating them inside
   * `mcr.microsoft.com/playwright:v1.63.0-noble` (EPIC-003's procedure). **That could not be done in
   * this session**: Docker's VM disk had 1.5 GB free against an image that needs more than 2 GB, and
   * the only way to make room was pruning volumes belonging to somebody else's project.
   *
   * So the tests are here and skip themselves until the baseline file exists, rather than being
   * deleted, faked on macOS (CI would never match a `-darwin` baseline), or committed in a state that
   * fails CI on a missing snapshot. Generate them with the command in the report and they switch on
   * with no further edit.
   */
  test.describe("visual regression", () => {
    // `process.cwd()` is the repo root: Playwright transpiles specs to CJS, where `import.meta` is
    // a syntax error, and the runner always starts from the config's directory.
    const baseline = join(process.cwd(), "apps/web/e2e/landing.spec.ts-snapshots/landing-light-linux.png");

    // **Linux only.** Playwright names snapshots by platform, so running this on macOS does not
    // compare against the committed baseline — it silently *writes a new `-darwin` one* and passes,
    // leaving two untracked PNGs that look like evidence and are not. That happened once already
    // with the /dev/ui gallery. CI is Linux and is where this test means something.
    //
    // `UPDATE_VISUAL=1` bypasses both guards, because generating the baseline is the one run that
    // has to happen before the baseline exists.
    const canCompare = process.platform === "linux" && existsSync(baseline);
    test.skip(!canCompare && process.env.UPDATE_VISUAL === undefined, "visual baselines are Linux-only — see EPIC-016's report");

    // maxDiffPixelRatio covers font-hinting differences between that image and GitHub's runner — a
    // real regression moves far more.
    for (const theme of ["light", "dark"] as const) {
      test(`landing page, ${theme} theme`, async ({ page }) => {
        await dismissConsent(page);
        await page.setViewportSize(LAPTOP);
        await page.goto("/");
        if (theme === "dark") await setTheme(page, "dark");
        // The logo morph is running; park it at rest so the baseline is not a random frame.
        await page.waitForTimeout(1_800);
        await expect(page).toHaveScreenshot(`landing-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.01 });
      });
    }
  });
});

test.describe("sign in and sign up", () => {
  test("both render the three ways in, styled, with the flows untouched", async ({ page }) => {
    for (const [path, heading] of [
      ["/sign-in", "Sign in"],
      ["/sign-up", "Create your account"]
    ] as const) {
      await page.goto(path);
      await expect(page.getByRole("heading", { name: heading, level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeVisible();
      await expect(page.getByLabel("Email")).toBeVisible();
    }
  });

  test("each offers the other", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("link", { name: "Create one" }).click();
    await expect(page).toHaveURL(/\/sign-up/);
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("promises nothing the product does not do", async ({ page }) => {
    await page.goto("/sign-up");
    const text = (await page.locator("body").textContent()) ?? "";
    // The mockup's side panel sells "50 runs a month" and "All nine lessons" next to a price.
    expect(text).not.toMatch(/runs a month|lessons|free forever|no card|per month/i);
  });
});

test.describe("metadata", () => {
  test("robots.txt allows / and /decompile and disallows /d/", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    expect(body).toMatch(/Allow: \/$/m);
    expect(body).toMatch(/Allow: \/decompile/);
    expect(body).toMatch(/Disallow: \/d\//);
    expect(body).toMatch(/Sitemap: http/);
  });

  /**
   * **Rewritten in EPIC-072, from a hand-written list to the served list against the route table.**
   *
   * It used to hold seven paths in a fixed order. That copy was correct until six pages shipped and
   * then it was simply the old site written down — and it failed on the new sitemap rather than on
   * anything being wrong, which is the least useful way for a test to go red. The property worth
   * asserting is not "these seven": it is that **what is served equals what the site says it has**,
   * and that nothing disallowed is advertised. `lib/site/routes-agree.test.ts` checks the same pair
   * against the source; this checks the XML a crawler actually receives.
   */
  test("sitemap.xml lists exactly the indexed pages, and nothing disallowed", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(locs.length).toBeGreaterThan(10);
    expect([...locs].sort()).toEqual([...INDEXED_ROUTES].sort());
    for (const route of NOT_INDEXED_ROUTES) expect(locs, `${route} is not indexed`).not.toContain(route);
    // Anything disallowed in robots.txt must not be advertised here.
    expect(body).not.toContain("/d/");
  });

  /**
   * **The lines are parsed, not searched for as substrings**, and the first version of this was
   * wrong in exactly that way: `expect(body).not.toContain("Disallow: /")` fails on a file
   * containing `Disallow: /d/`, because one is a prefix of the other. It reported a defect in
   * `robots.ts`, which was correct the whole time.
   */
  test("robots.txt disallows what the sitemap leaves out, and nothing it advertises", async ({ request }) => {
    const body = await (await request.get("/robots.txt")).text();
    const disallowed = new Set(
      [...body.matchAll(/^Disallow:\s*(\S*)\s*$/gm)].map((match) => match[1] ?? "")
    );
    expect(disallowed.size).toBeGreaterThan(3);
    for (const route of NOT_INDEXED_ROUTES) expect([...disallowed], `${route}`).toContain(route);
    // The control: a page meant to be indexed must not be on a Disallow line of its own, and must
    // not sit under a disallowed prefix either.
    for (const route of INDEXED_ROUTES) {
      const blocked = [...disallowed].some((prefix) => prefix !== "" && route.startsWith(prefix));
      expect(blocked, `${route} is advertised in the sitemap and disallowed in robots.txt`).toBe(false);
    }
  });

  /**
   * **Every page advertised for indexing declares its canonical, and names the apex.**
   *
   * Driven off `sitemap.xml` rather than a hand-written list, because the failure this catches is a
   * page being *added* without one. `/decompile` sat in the sitemap with no canonical tag at all from
   * EPIC-013 until production verification found it by hand — every sibling had one, so nothing
   * noticed. A list here would have had the same hole; the sitemap cannot.
   */
  test("every page in the sitemap declares a canonical naming the apex", async ({ page, request }) => {
    const sitemap = await (await request.get("/sitemap.xml")).text();
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(urls.length).toBeGreaterThan(2);

    for (const url of urls) {
      const { origin, pathname } = new URL(url);
      await page.goto(pathname);
      const canonical = page.locator('link[rel="canonical"]');
      await expect(canonical, `${pathname} has no canonical tag`).toHaveCount(1);

      // Trailing slash is Next's own normalisation of "/" against metadataBase; compare origins and
      // paths rather than strings so that is not mistaken for a mismatch.
      const href = new URL((await canonical.getAttribute("href")) ?? "");
      expect(href.origin, `${pathname} canonicals to a different host`).toBe(origin);
      expect(href.pathname.replace(/\/$/, ""), `${pathname} canonicals to a different path`).toBe(
        pathname.replace(/\/$/, "")
      );
    }
  });

  test("the home page carries title, description, canonical and a card", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/41Prompts/);
    // The origin itself, with no path — Next renders `alternates.canonical: "/"` against
    // `metadataBase` and drops the trailing slash.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /^https?:\/\/[^/]+\/?$/);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /named bloks/);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /opengraph-image/);
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  });

  test("the Open Graph image renders at 1200×630", async ({ request }) => {
    const response = await request.get("/opengraph-image");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
    const body = await response.body();
    // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
    expect(body.readUInt32BE(16)).toBe(1200);
    expect(body.readUInt32BE(20)).toBe(630);
  });

  /**
   * **This test used to assert that the legal pages were placeholders**, in those words: it checked
   * the body said "not written yet" and that the page was `noindex`. Both were true and both were
   * the problem — a site collecting email addresses behind unwritten legal pages, with a gate that
   * could only fail if somebody *wrote* them. `PROCESS.md`, "a helper that normalises state": same
   * family, a test that encodes the defect as the expectation.
   *
   * EPIC-017 wrote them. What is asserted now is what a reader needs: real content, indexable, and
   * the one honest caveat.
   */
  test("the legal pages are written, indexable, and say who wrote them", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: "Terms of service" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("not written yet");
    await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
    await expect(page.getByText("has not been reviewed by a lawyer")).toHaveCount(1);
  });
});

test.describe("the landing nav follows the session", () => {
  test("shows Sign in to a visitor with no session", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("nav-sign-in")).toBeVisible();
    await expect(page.getByTestId("nav-dashboard")).toHaveCount(0);
    // Documentation, not the assertion — only under `pnpm e2e:capture`. See `auth.spec.ts`.
    if (CAPTURING) {
      await page.locator(".site-nav").screenshot({ path: "docs/epics/reports/screenshots/host-split/nav-signed-out.png" });
    }
  });
});

/**
 * EPIC-016b: the home page's illustrative sections, the rotator, and what reduced motion shows.
 *
 * `page.test.tsx` reads the server's markup, which is where the `Example` markers, the ARIA and the
 * copy are settled. What it cannot see is the half of this epic that only exists in a browser: an
 * animation that runs, a timer that advances, a sweep that finishes, and the same page with
 * `prefers-reduced-motion` on.
 *
 * **Every reduced-motion assertion is about the end state, not about stillness.** A page that
 * rendered its rows invisible and then refused to animate them would pass "nothing moved" and be
 * broken. So each one asserts the finished value — the row opaque, the meter at its width, the
 * sweep full, the rotator on a panel — *and* that nothing is animating.
 */
test.describe("the home page's illustrative sections", () => {
  const PHONE_390 = { width: 390, height: 844 };

  test("marks every illustrative surface as an example, in the accessibility tree", async ({ page }) => {
    await page.goto("/");
    // `<figure>` + `<figcaption>`, so "Example, <what>" is announced with the thing it describes
    // rather than being a styled word beside it.
    const figures = page.locator("figure.example");
    // Nine since EPIC-016c: four on the page itself, and one inside each of the rotator's five
    // panels. `Tabs` keeps all five panels in the DOM and hides four, so the count is nine while
    // what a reader can see at any moment is five.
    await expect(figures).toHaveCount(9);
    for (const what of [
      "a prompt open in the editor",
      "one suite, graded across three models",
      "one model's output, and the check it failed",
      "the same suite on three providers",
      "a pasted prompt, split into bloks",
      "two of the bloks that prompt is built from",
      "the same checks on three models",
      "the publish gate, with one row stopping it",
      "an application resolving the published prompt"
    ]) {
      await expect(page.locator("figure.example figcaption", { hasText: what })).toHaveCount(1);
    }
  });

  test.describe("the capability rotator", () => {
    /**
     * The rotator has to be **on screen** for any of these, since EPIC-016c gated the timer on an
     * `IntersectionObserver`. Scrolling to it is therefore not setup noise — it is half of what
     * each of these tests is about, and a test that forgot it would sit on Import forever and
     * report a broken timer.
     */
    async function scrollToRotator(page: import("@playwright/test").Page) {
      await page.getByRole("tablist", { name: "What the platform does" }).scrollIntoViewIfNeeded();
      // The pointer starts at (0, 0) in a fresh context, which is nowhere near the rotator — but
      // `scrollIntoViewIfNeeded` can leave it hovering after the scroll moves the element under it.
      await page.mouse.move(0, 0);
    }

    test("advances on its own, and keeps advancing after the reader picks a tab", async ({ page }) => {
      await page.goto("/");
      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(5);
      await expect(page.getByRole("tab", { name: "Import" })).toHaveAttribute("aria-selected", "true");
      await scrollToRotator(page);

      // One cycle is 5s. Give it a cycle and a bit rather than polling fast, because what is being
      // asserted is that the timer exists at all.
      await expect
        .poll(async () => page.getByRole("tab", { name: "Import" }).getAttribute("aria-selected"), { timeout: 9_000 })
        .toBe("false");

      // EPIC-016c, Soroush's ruling of 2026-09-21: the mockup restarts the cycle on a click and so
      // does this. Clicking leaves focus on the tab, which *pauses* it — so the assertion is that
      // the cycle comes back once focus and the pointer have left, which is the behaviour a reader
      // actually experiences.
      await page.getByRole("tab", { name: "Publish" }).click();
      await expect(page.getByRole("tab", { name: "Publish" })).toHaveAttribute("aria-selected", "true");
      await page.waitForTimeout(6_000);
      await expect(
        page.getByRole("tab", { name: "Publish" }),
        "focus was still on the tab, so the cycle should have stayed put"
      ).toHaveAttribute("aria-selected", "true");

      // Blurred in place, **not** by clicking something else: `click()` scrolls its target into
      // view, and clicking the hero would scroll the rotator off screen — where the visibility gate
      // correctly stops the timer, so the test would be measuring the gate and calling it the
      // restart. Found by writing it the obvious way first and watching it fail.
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.mouse.move(0, 0);
      await expect
        .poll(async () => page.getByRole("tab", { name: "Publish" }).getAttribute("aria-selected"), { timeout: 9_000 })
        .toBe("false");
    });

    test("pauses while the pointer is on it, and resumes when it leaves", async ({ page }) => {
      await page.goto("/");
      await scrollToRotator(page);
      const selected = page.locator('[role="tab"][aria-selected="true"]');
      const word = async () => (await selected.textContent()) ?? "";

      await page.getByRole("tablist", { name: "What the platform does" }).hover();
      const held = await word();
      // Longer than a cycle. WCAG 2.2.2 wants a way to stop content that updates by itself, and
      // hovering is it — a panel must not be taken away from somebody who is reading it.
      await page.waitForTimeout(7_000);
      expect(await word(), "the rotator advanced while the pointer was on it").toBe(held);

      await page.mouse.move(0, 0);
      await expect.poll(word, { timeout: 9_000 }).not.toBe(held);
    });

    /**
     * The visibility gate, which is the departure EPIC-016b's report did not even record.
     *
     * Without it a reader who scrolls slowly down a twelve-section page arrives at a rotator that
     * has been advancing for nobody and is three panels in. The assertion is written as the reader
     * experiences it — scroll away, wait out more than a cycle, come back, and the selection has
     * not moved — rather than by reading the observer back out of the component.
     */
    test("does not advance while it is off screen", async ({ page }) => {
      await page.goto("/");
      await scrollToRotator(page);
      const selected = page.locator('[role="tab"][aria-selected="true"]');
      const word = async () => (await selected.textContent()) ?? "";

      // Prove the timer is alive here, so that "it did not move" below cannot be a dead rotator.
      const first = await word();
      await expect.poll(word, { timeout: 9_000 }).not.toBe(first);

      const parked = await word();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.mouse.move(0, 0);
      await page.waitForTimeout(7_000);
      await scrollToRotator(page);
      expect(await word(), "the timer ran while the rotator was off screen").toBe(parked);
    });

    test("a reader who has not scrolled to it yet finds it on Import", async ({ page }) => {
      await page.goto("/");
      // The rotator is far below the fold. Wait out more than two cycles without going near it.
      await page.waitForTimeout(11_000);
      await expect(page.getByRole("tab", { name: "Import" })).toHaveAttribute("aria-selected", "true");
    });

    test("is a vertical tablist the keyboard can work", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      // Take it over first, so the timer cannot move the selection underneath the assertions.
      await page.getByRole("tab", { name: "Import" }).click();
      const list = page.getByRole("tablist", { name: "What the platform does" });
      await expect(list).toHaveAttribute("aria-orientation", "vertical");

      // One tab stop for the whole list: the four unselected tabs are not in the tab order.
      await expect(page.locator('[role="tab"][tabindex="0"]')).toHaveCount(1);

      await page.keyboard.press("ArrowDown");
      await expect(page.getByRole("tab", { name: "Compose" })).toBeFocused();
      await expect(page.getByRole("tab", { name: "Compose" })).toHaveAttribute("aria-selected", "true");

      await page.keyboard.press("End");
      await expect(page.getByRole("tab", { name: "Deliver" })).toBeFocused();
      await expect(page.getByRole("tabpanel")).toContainText("Your application reads it at runtime");

      await page.keyboard.press("Home");
      await expect(page.getByRole("tab", { name: "Import" })).toBeFocused();

      // The mockup's fifth tab. There are no lessons, and `lessons?` is denylisted.
      await expect(page.getByRole("tab", { name: "Learn" })).toHaveCount(0);
    });

    test("shows exactly one panel, and it is the selected tab's", async ({ page }) => {
      await page.goto("/");
      await page.getByRole("tab", { name: "Test" }).click();
      await expect(page.getByRole("tabpanel")).toHaveCount(1);
      // The mockup's heading, restored in EPIC-016c — and it sits over the three model badges the
      // mockup drew under it, which is the pairing EPIC-016b's rewrite broke.
      await expect(page.getByRole("tabpanel")).toContainText("Test it on every model");
    });

    /**
     * Each panel's illustration, as a reader meets it: one at a time, each marked, each showing
     * the product rather than describing it.
     *
     * The count is per panel rather than over the page, because "nine figures exist" is already
     * asserted above and says nothing about *which* panel is missing one.
     */
    for (const [tab, what] of [
      ["Import", "a pasted prompt, split into bloks"],
      ["Compose", "two of the bloks that prompt is built from"],
      ["Test", "the same checks on three models"],
      ["Publish", "the publish gate, with one row stopping it"],
      ["Deliver", "an application resolving the published prompt"]
    ] as const) {
      test(`the ${tab} panel shows an illustration, marked as one`, async ({ page }) => {
        await page.goto("/");
        await page.getByRole("tab", { name: tab }).click();
        const panel = page.getByRole("tabpanel");
        await expect(panel.locator("figure.example")).toHaveCount(1);
        await expect(panel.locator("figcaption")).toContainText(what);
        await expect(panel.locator(".rot-fig")).toBeVisible();
      });
    }
  });

  test("Replay restarts the shot's walk", async ({ page }) => {
    await page.goto("/");
    const span = page.locator('.shot .shot-span[data-b="b4"]');
    // The walk is a CSS animation the server renders already running, so there is one to read.
    const before = await span.evaluate((el) => el.getAnimations().length);
    expect(before).toBe(1);

    // Let the walk finish, which is when somebody actually reaches for `Replay`. **Not a comparison
    // of two clock readings**: the last pair's animation ends about three seconds in, so "the second
    // number is smaller" is a race against how long the assertions above took. What is asserted is
    // what the control claims — after the click there is a walk again, and it is at its beginning.
    await page.waitForTimeout(3_200);

    await page.getByRole("button", { name: "Replay" }).click();
    await expect
      .poll(async () => span.evaluate((el) => Number(el.getAnimations()[0]?.currentTime ?? -1)), { timeout: 3_000 })
      .toBeLessThan(500);
    expect(await span.evaluate((el) => el.getAnimations().length)).toBe(1);
  });

  test.describe("prefers-reduced-motion shows the end of each animation", () => {
    test.use({ reducedMotion: "reduce" });

    test("the rows are landed, the meters are full, and nothing is animating", async ({ page }) => {
      await page.goto("/");
      const rows = page.locator(".run-demo tbody tr");
      await expect(rows).toHaveCount(5);

      const state = await page.locator(".run-demo").evaluate((table) => {
        const rowEls = [...table.querySelectorAll("tbody tr")];
        return {
          animations: rowEls.reduce((n, row) => n + row.getAnimations().length, 0),
          meterAnimations: [...table.querySelectorAll(".meter-fill")].reduce((n, m) => n + m.getAnimations().length, 0),
          // Landed means "no offset left", which is the end of `row-in`. Opacity is not part of
          // that animation — `landing.css` says why it must not be.
          transforms: rowEls.map((row) => getComputedStyle(row).transform),
          // The first row's check passed everything, so its meter fills its track.
          firstMeter: Math.round(
            (table.querySelector(".meter-fill")?.getBoundingClientRect().width ?? 0) * 100 /
              Math.max(1, table.querySelector(".meter-track")?.getBoundingClientRect().width ?? 1)
          )
        };
      });
      expect(state.animations, "a row was still animating under reduced motion").toBe(0);
      expect(state.meterAnimations, "a meter was still animating under reduced motion").toBe(0);
      expect(new Set(state.transforms), "a row was left offset under reduced motion").toEqual(new Set(["none"]));
      // Landed, not skipped: the meter is at its value, not at zero.
      expect(state.firstMeter).toBeGreaterThanOrEqual(95);
    });

    test("the shot is at rest and the walk is off", async ({ page }) => {
      await page.goto("/");
      const running = await page
        .locator(".shot")
        .evaluate((shot) => [...shot.querySelectorAll("[data-b]")].reduce((n, el) => n + el.getAnimations().length, 0));
      expect(running).toBe(0);
      // Both panes are complete; the picture is finished, it simply did not move to get there.
      await expect(page.locator(".shot .shot-span")).toHaveCount(4);
      await expect(page.locator(".shot .shot-blok")).toHaveCount(5);
      // A Replay that replays nothing is worse than no Replay.
      await expect(page.getByRole("button", { name: "Replay" })).toHaveCount(0);
    });

    test("the rotator sits on a panel with its indicator finished, and does not advance", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      const selected = page.locator('[role="tab"][aria-selected="true"]');
      await expect(selected).toHaveCount(1);
      await expect(page.getByRole("tabpanel")).toBeVisible();

      const sweep = await selected.evaluate((tab) => {
        const mark = tab.querySelector(".rot-sweep");
        return {
          animations: mark?.getAnimations().length ?? -1,
          ratio: Math.round(
            ((mark?.getBoundingClientRect().width ?? 0) / Math.max(1, tab.getBoundingClientRect().width)) * 100
          )
        };
      });
      expect(sweep.animations, "the sweep was animating under reduced motion").toBe(0);
      // Its end state is a finished sweep, which is also what a stopped rotator shows.
      expect(sweep.ratio).toBeGreaterThanOrEqual(99);

      await page.waitForTimeout(7_000);
      await expect(page.getByRole("tab", { name: "Import" })).toHaveAttribute("aria-selected", "true");
    });

    /**
     * The panel's illustration under reduced motion: **complete and in place**, not absent.
     *
     * `docs/design/README.md` corrects the mockup on exactly this — its own reduced-motion rule is
     * `animation: none` over a `width: 0` base, which shows nothing. Ours staggers with a transform
     * whose resting value is the end state, so switching the animation off leaves the finished
     * picture. Each of the three assertions below is one way that could go wrong: still animating,
     * left offset, or faded out.
     */
    test("every panel's illustration is finished and in place, with nothing animating", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/");
      for (const tab of ["Import", "Compose", "Test", "Publish", "Deliver"] as const) {
        await page.getByRole("tab", { name: tab }).click();
        const state = await page.getByRole("tabpanel").evaluate((panel) => {
          const items = [...panel.querySelectorAll<HTMLElement>(".rot-fig .pop")];
          return {
            count: items.length,
            animations: items.reduce((n, el) => n + el.getAnimations().length, 0),
            transforms: items.map((el) => getComputedStyle(el).transform),
            opacities: items.map((el) => Number(getComputedStyle(el).opacity))
          };
        });
        expect(state.count, `${tab} lost its illustration`).toBe(2);
        expect(state.animations, `${tab} was still animating under reduced motion`).toBe(0);
        expect(new Set(state.transforms), `${tab} was left offset under reduced motion`).toEqual(new Set(["none"]));
        expect(Math.min(...state.opacities), `${tab} was left faded under reduced motion`).toBe(1);
      }
    });
  });

  test("does not scroll sideways at 390px, and every new control clears 44px", async ({ page }) => {
    await page.setViewportSize(PHONE_390);
    await page.goto("/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(PHONE_390.width);

    // And the panel itself, per panel. EPIC-016b's own defect was a grid track that made the page
    // scroll sideways; five illustrations inside a fixed-width card is the same trap one level in,
    // and a page-level `scrollWidth` check passes happily while a card scrolls on its own.
    for (const tab of ["Import", "Compose", "Test", "Publish", "Deliver"] as const) {
      await page.getByRole("tab", { name: tab }).click();
      const overflow = await page.getByRole("tabpanel").evaluate((panel) => panel.scrollWidth - panel.clientWidth);
      expect(overflow, `the ${tab} panel scrolls sideways at 390px`).toBeLessThanOrEqual(0);
    }

    for (const locator of [
      page.getByRole("button", { name: "Replay" }),
      page.getByRole("tab", { name: "Import" }),
      page.getByRole("tab", { name: "Deliver" }),
      page.getByRole("button", { name: "Why does it matter which line failed?" })
    ]) {
      const box = await locator.boundingBox();
      expect(box, "element must be laid out").not.toBeNull();
      expect(
        box!.height,
        `${await locator.evaluate((el) => el.className)} is under the 44px minimum`
      ).toBeGreaterThanOrEqual(44);
    }
  });
});
