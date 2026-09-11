import { existsSync } from "node:fs";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  // The theme-switch colour transition (base.css) is 0.3s; let it finish so a screenshot doesn't
  // capture a blended in-between frame.
  await page.waitForTimeout(350);
}

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

        for (const locator of [page.locator(".askbar"), page.getByRole("button", { name: "Decompile it" })]) {
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

    test("is the only call to action above the fold", async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await page.goto("/");

      // Decision 2. "Sign in" is a small nav link and is allowed; what must not be up here is a
      // second promoted action competing with the paste.
      const promoted = await page.locator(".btn-pri").evaluateAll((els, fold) =>
        els.filter((el) => el.getBoundingClientRect().top < fold).map((el) => el.textContent?.trim() ?? ""),
        LAPTOP.height
      );
      expect(promoted).toEqual(["Decompile it"]);
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
        await page.getByRole("button", { name: "Decompile it" }).click();

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
      await page.getByRole("button", { name: "Decompile it" }).click();
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
            return `${el.tagName.toLowerCase()}:${(el.textContent ?? "").trim().slice(0, 22) || el.getAttribute("aria-label") || ""}`;
          })
        );
      }
      expect(reached.some((r) => r.startsWith("a:") && r.includes("Decompiler"))).toBe(true);
      expect(reached.some((r) => r.startsWith("textarea"))).toBe(true);
      expect(reached.some((r) => r.includes("Decompile it"))).toBe(true);
    });

    test("the ask bar submits from the keyboard alone", async ({ page }) => {
      await page.goto("/");
      await page.getByLabel("Your prompt").focus();
      await page.keyboard.type("Always respond in JSON only.");
      await page.getByRole("button", { name: "Decompile it" }).focus();
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
        page.getByRole("button", { name: "Decompile it" }),
        nav.getByRole("link", { name: "Decompiler" }),
        nav.getByRole("link", { name: "Sign in" }),
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

    test("uses no pass, fail or drift colour anywhere on the page", async ({ page }) => {
      await page.goto("/");
      const offenders = await page.evaluate(() => {
        const reserved = ["--color-pass", "--color-fail", "--color-warn"];
        const styles = getComputedStyle(document.documentElement);
        const values = reserved
          .flatMap((token) => [styles.getPropertyValue(token).trim(), styles.getPropertyValue(`${token}-soft`).trim()])
          .filter(Boolean);
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>("body *")) {
          const computed = getComputedStyle(el);
          for (const property of ["color", "backgroundColor", "borderTopColor", "borderBottomColor"] as const) {
            if (values.some((value) => value && computed[property] === value)) bad.push(`${el.className}:${property}`);
          }
        }
        return bad;
      });
      expect(offenders).toEqual([]);
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
    test.skip(!existsSync(baseline), "Linux baseline not generated yet — see EPIC-016's report");

    // maxDiffPixelRatio covers font-hinting differences between that image and GitHub's runner — a
    // real regression moves far more.
    for (const theme of ["light", "dark"] as const) {
      test(`landing page, ${theme} theme`, async ({ page }) => {
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

  test("sitemap.xml lists only pages that exist and are indexable", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text();
    const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
    expect(locs).toEqual(["/", "/decompile"]);
    // Anything disallowed in robots.txt must not be advertised here.
    expect(body).not.toContain("/d/");
    expect(body).not.toContain("/legal/");
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

  test("the legal stubs are honest and not indexable", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: "Terms of service" })).toBeVisible();
    await expect(page.locator("body")).toContainText("not written yet");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  });
});
