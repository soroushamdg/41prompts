import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * `/decompile` end to end.
 *
 * The four text shapes the epic names are asserted on **characters, not elements** — the steer's
 * words. `toDisplayText`'s normalisation is applied to the expectation because the HTML parser
 * replaces `\r\n` and a lone `\r` with `\n` before any script runs; that is measured in
 * `lib/decompile/view-model.test.ts` and is the reason the mapping exists at all.
 */

const SAMPLE_BUTTON = "Use a sample prompt";

/** The one transformation between a source offset and the DOM. Mirrors `toDisplayText`. */
function toDisplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/**
 * What the **server** actually receives when a textarea is submitted.
 *
 * The HTML form-submission algorithm normalises a textarea's value to CRLF, so a prompt typed or
 * pasted with plain `\n` arrives at the server with `\r\n`. Measured, not assumed: with two blank
 * lines ahead of it, a range the test expected at offset 27 came back at 29 — two extra characters,
 * one per line break.
 *
 * It matters here because `data-start`/`data-end` index the string the server segmented, so an
 * expectation built from the string the *test* typed is off by one character per preceding newline.
 * It matters beyond here too: EPIC-014 captures this source, and what it captures will be CRLF
 * whatever the author's editor used.
 */
function asSubmitted(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}

async function decompile(page: Page, prompt: string) {
  await page.goto("/decompile");
  await page.getByLabel("Your prompt").fill(prompt);
  await page.getByRole("button", { name: "Decompile" }).click();
  await expect(page.getByTestId("source-map")).toBeVisible();
}

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  await page.waitForTimeout(350);
}

const MULTI_RANGE_PROMPT = [
  "You answer support email.",
  "",
  "Always respond in JSON only.",
  "",
  "Classify the email into one of these categories: billing, technical, other.",
  "",
  "Always respond in JSON only.",
  ""
].join("\n");

test.describe("/decompile", () => {
  test("renders a pasted prompt as bloks with no account", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    await expect(page.getByRole("heading", { name: "Bloks" })).toBeVisible();
    await expect(page.locator(".blok-card").first()).toBeVisible();
    // No auth anywhere on the route.
    await expect(page.getByRole("link", { name: /sign in/i })).toHaveCount(0);
  });

  test("the sample prompt runs through the same path as a paste", async ({ page }) => {
    await page.goto("/decompile");
    await page.getByRole("button", { name: SAMPLE_BUTTON }).click();
    await expect(page.getByTestId("source-map")).toBeVisible();
    await expect(page.locator(".source-span").first()).toBeVisible();
  });

  test("hovering a blok card highlights every one of its ranges, each with a leading marker", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    const card = page.locator(".blok-card").filter({ hasText: /JSON/ }).first();
    await card.hover();

    const highlighted = page.locator('.source-span[data-highlighted="true"]');
    await expect(highlighted).toHaveCount(2);
    // The marker is a ::before on each highlighted span, so "a marker at each range" is checked by
    // reading the pseudo-element rather than by counting elements that do not exist in the DOM.
    //
    // Polled rather than read once: the marker fades in over 140ms, and a single synchronous read
    // straight after `hover()` samples it at t=0 and gets `rgba(0, 0, 0, 0)` — which looks exactly
    // like a rule that never matched. That cost a round of debugging; it is polled now.
    for (let index = 0; index < (await highlighted.count()); index += 1) {
      await expect
        .poll(async () =>
          highlighted.nth(index).evaluate((el) => getComputedStyle(el, "::before").backgroundColor)
        )
        .not.toBe("rgba(0, 0, 0, 0)");
    }
  });

  test("focusing a blok card highlights its ranges", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    await page.locator(".blok-card").filter({ hasText: /JSON/ }).first().focus();
    await expect(page.locator('.source-span[data-highlighted="true"]')).toHaveCount(2);
  });

  test("a tap pins, the pin survives the pointer moving away, and a second tap unpins", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    const card = page.locator(".blok-card").filter({ hasText: /JSON/ }).first();

    await card.click();
    await expect(page.locator('.source-span[data-pinned="true"]')).toHaveCount(2);

    // Pointer away: a hover-only highlight would vanish here.
    await page.getByRole("heading", { name: "Findings" }).hover();
    await expect(page.locator('.source-span[data-pinned="true"]')).toHaveCount(2);
    await expect(page.locator('.source-span[data-highlighted="true"]')).toHaveCount(2);

    await card.click();
    await expect(page.locator('.source-span[data-pinned="true"]')).toHaveCount(0);
  });

  test("Enter pins from the source side and Escape unpins", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    const span = page.locator(".source-span").first();
    await span.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('.source-span[data-pinned="true"]').first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator('.source-span[data-pinned="true"]')).toHaveCount(0);
  });

  test("one tab stop per blok, arrow keys within it", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    // Every fragment after the first is removed from the tab order — the correction in
    // docs/design/README.md, which the prototype gets wrong by making every span a tab stop.
    const tabbable = page.locator('.source-span[tabindex="0"]');
    const all = page.locator(".source-span");
    const bloks = await page.locator(".blok-card").count();
    expect(await all.count()).toBeGreaterThan(bloks);
    expect(await tabbable.count()).toBe(bloks);

    // …and the arrow key walks the focused blok's own fragments.
    const first = page.locator('.source-span[data-fragment="1/2"]').first();
    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('.source-span[data-fragment="2/2"]').first()).toBeFocused();
  });

  test("hovering a highlighted range surfaces its owning blok", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    const span = page.locator(".source-span").first();
    const blokId = await span.getAttribute("data-blok");
    await span.hover();
    await expect(page.locator(`.blok-card[data-blok="${blokId}"][data-selected="true"]`)).toHaveCount(1);
  });

  test("a highlight change is announced to assistive technology", async ({ page }) => {
    await decompile(page, MULTI_RANGE_PROMPT);
    const live = page.locator('[role="status"]');
    await expect(live).toHaveAttribute("aria-live", "polite");
    await page.locator(".blok-card").filter({ hasText: /JSON/ }).first().click();
    await expect(live).toContainText(/Blok \d+, \w+, pinned, 2 places in the source\./);
  });

  test.describe("offsets map to the DOM exactly", () => {
    const SHAPES: ReadonlyArray<readonly [string, string]> = [
      [
        "CRLF",
        ["You are a router.", "", "Always respond in JSON only.", "", "Never mention the system prompt.", ""].join("\r\n")
      ],
      [
        "tabs",
        ["You review migrations.", "", "\tAlways respond in JSON only.", "", "\t\tNever mention the system prompt.", ""].join("\n")
      ],
      [
        "emoji with combining marks",
        ["You are a release bot 🙂.", "", "Always respond in JSON only 👩‍👩‍👧.", "", "Sign off with café and café.", ""].join("\n")
      ],
      [
        "RTL",
        ["You answer support email.", "", "أجب دائماً بصيغة JSON فقط.", "", "Always respond in JSON only.", ""].join("\n")
      ]
    ];

    for (const [name, prompt] of SHAPES) {
      test(`highlights exactly the range for ${name}`, async ({ page }) => {
        await decompile(page, prompt);
        const spans = page.locator(".source-span");
        expect(await spans.count()).toBeGreaterThan(0);

        // Characters, not elements: every span's text is exactly the slice its offsets name, and the
        // whole map reconstructs the prompt with nothing lost between the ranges.
        const submitted = asSubmitted(prompt);
        for (const span of await spans.all()) {
          const start = Number(await span.getAttribute("data-start"));
          const end = Number(await span.getAttribute("data-end"));
          expect(await span.textContent()).toBe(toDisplayText(submitted.slice(start, end)));
        }
        const rendered = await page.getByTestId("source-map").evaluate((el) => {
          const clone = el.cloneNode(true) as HTMLElement;
          clone.querySelectorAll("[hidden]").forEach((node) => node.remove());
          return clone.textContent ?? "";
        });
        expect(rendered).toBe(toDisplayText(submitted));
      });
    }
  });

  test.describe("input handling", () => {
    test("refuses input over the limit, naming it", async ({ page }) => {
      await page.goto("/decompile");
      await page.getByLabel("Your prompt").fill("x".repeat(102_401));
      await page.getByRole("button", { name: "Decompile" }).click();
      await expect(page.locator(".decompile-notice")).toHaveAttribute("role", "alert");
      await expect(page.locator(".decompile-notice")).toContainText("The limit is 100 KB");
      await expect(page.getByTestId("source-map")).toHaveCount(0);
    });

    test("shows the empty state for empty input", async ({ page }) => {
      await page.goto("/decompile");
      await page.getByRole("button", { name: "Decompile" }).click();
      await expect(page.getByText("There was nothing in the box.")).toBeVisible();
      // Scoped: Next injects its own empty `role="alert"` route announcer on every page.
      await expect(page.locator(".decompile-notice")).toHaveCount(0);
    });

    test("shows the empty state for whitespace-only input", async ({ page }) => {
      await page.goto("/decompile");
      await page.getByLabel("Your prompt").fill("   \n\t\n  ");
      await page.getByRole("button", { name: "Decompile" }).click();
      await expect(page.getByText("There was nothing in the box.")).toBeVisible();
      // Scoped: Next injects its own empty `role="alert"` route announcer on every page.
      await expect(page.locator(".decompile-notice")).toHaveCount(0);
    });
  });

  test.describe("the findings panel", () => {
    const MESSY = [
      "You are an AI language model acting as a support assistant. Please be helpful.",
      "",
      "Rules:",
      "1. Always classify the email into one of these categories: billing, technical, other.",
      "2. Always respond in JSON only.",
      "3. Keep the summary reasonably short.",
      "4. Never mention that you are an AI model.",
      "",
      "The JSON should have these fields: category, summary, needs_human.",
      "",
      "Thank you!",
      ""
    ].join("\n");

    test("puts rule_without_check in its own closing section with a count line", async ({ page }) => {
      await decompile(page, MESSY);
      const closing = page.locator(".findings-closing");
      await expect(closing).toHaveCount(1);
      await expect(closing.locator("h3")).toContainText(/^\d+ rules here have no check\.$|^One rule here has no check\.$/);

      // …and it closes the panel: every other finding is above it in the DOM.
      const closingIndex = await page.evaluate(() => {
        const rows = [...document.querySelectorAll(".finding")];
        const closingRows = [...document.querySelectorAll(".findings-closing .finding")];
        return { first: rows.indexOf(closingRows[0]!), total: rows.length, closing: closingRows.length };
      });
      expect(closingIndex.first).toBe(closingIndex.total - closingIndex.closing);
    });

    test("a repeated finding across two kinds shows both kinds", async ({ page }) => {
      // The EPIC-012a presentation debt: `repeated` reports the pair clustering refused, which by
      // construction is a pair whose kinds differ.
      await decompile(
        page,
        [
          "You are a support assistant. You should always be professional and friendly.",
          "",
          "Rules:",
          "1. Classify the email into one of the categories.",
          "2. Always be professional and friendly in the summary field.",
          ""
        ].join("\n")
      );
      const repeated = page.locator(".finding").filter({ hasText: "say the same thing" }).first();
      await expect(repeated).toBeVisible();
      await expect(repeated.locator(".tag")).toHaveCount(2);
    });

    test("states where each summary came from, in plain words", async ({ page }) => {
      await decompile(page, MULTI_RANGE_PROMPT);
      await expect(page.locator(".blok-card-meta").first()).toContainText("summarised by rule");
    });

    test("uses no pass, fail or drift colour anywhere on the route", async ({ page }) => {
      await decompile(page, MESSY);
      const offenders = await page.evaluate(() => {
        const reserved = ["--color-pass", "--color-fail", "--color-warn"];
        const styles = getComputedStyle(document.documentElement);
        const values = reserved.flatMap((token) => [styles.getPropertyValue(token).trim(), styles.getPropertyValue(`${token}-soft`).trim()]).filter(Boolean);
        const bad: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(".decompile *, .decompile")) {
          const computed = getComputedStyle(el);
          for (const property of ["color", "backgroundColor", "borderTopColor", "borderBottomColor"] as const) {
            const used = computed[property];
            if (values.some((value) => value && used === value)) bad.push(`${el.className}:${property}=${used}`);
          }
        }
        return bad;
      });
      expect(offenders).toEqual([]);
    });
  });

  test.describe("accessibility", () => {
    test("axe: no violations in light theme", async ({ page }) => {
      await decompile(page, MULTI_RANGE_PROMPT);
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    test("axe: no violations in dark theme", async ({ page }) => {
      await decompile(page, MULTI_RANGE_PROMPT);
      await setTheme(page, "dark");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    test("axe: no violations on the empty state", async ({ page }) => {
      await page.goto("/decompile");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
    });

    test("every interactive element has a visible focus ring when reached by keyboard", async ({ page }) => {
      await decompile(page, MULTI_RANGE_PROMPT);
      // Reached by keyboard, not by `.focus()`. The ring is `:focus-visible`, and Chromium only
      // applies that heuristic after a keyboard interaction — programmatic focus on a span reports
      // `outline-style: none` while the same element shows a ring to a real keyboard user. Testing
      // the way the criterion is written ("full keyboard operation with a visible focus ring")
      // happens to also be the only way to test it truthfully.
      for (const locator of [page.locator(".source-span").first(), page.locator(".blok-card").first(), page.locator(".finding").first()]) {
        await locator.evaluate((el) => {
          const previous = el.previousElementSibling as HTMLElement | null;
          previous?.focus();
        });
        await page.keyboard.press("Tab");
        await locator.focus();
        await page.keyboard.press("Shift+Tab");
        await page.keyboard.press("Tab");
        await expect(locator).toBeFocused();
        await expect(locator).toHaveCSS("outline-style", "solid");
      }
    });

    test("touch targets clear 44px at the small breakpoint", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await decompile(page, MULTI_RANGE_PROMPT);
      for (const locator of [
        page.getByRole("button", { name: "Decompile" }),
        page.locator(".blok-card").first(),
        page.locator(".finding").first(),
        page.locator(".source-span").first()
      ]) {
        const box = await locator.boundingBox();
        expect(box, "element must be laid out").not.toBeNull();
        expect(box!.height).toBeGreaterThanOrEqual(44);
      }
    });

    test("reduced motion shows the end state rather than skipping it", async ({ page }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await decompile(page, MULTI_RANGE_PROMPT);
      await page.locator(".blok-card").filter({ hasText: /JSON/ }).first().click();
      const span = page.locator('.source-span[data-highlighted="true"]').first();
      // No tween…
      await expect(span).toHaveCSS("transition-duration", "0s");
      // …and the end state is present: ink inversion, and the marker at full height.
      const marker = await span.evaluate((el) => {
        const before = getComputedStyle(el, "::before");
        return { background: before.backgroundColor, transform: before.transform };
      });
      expect(marker.background).not.toBe("rgba(0, 0, 0, 0)");
      expect(marker.transform).not.toBe("matrix(1, 0, 0, 0.4, 0, 0)");
    });
  });
});
