import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Sharing, opening, removing and the waitlist.
 *
 * The round-trip tests are the ones that matter: a permalink's whole promise is that a colleague sees
 * what the sharer saw, and the four text shapes from EPIC-013 are where that promise breaks quietly.
 */

const PROMPT = [
  "You are an AI language model acting as a support assistant. Please be helpful.",
  "",
  "Rules:",
  "1. Always classify the email into one of these categories: billing, technical, other.",
  "2. Always respond in JSON only.",
  "3. Keep the summary reasonably short.",
  "",
  "The JSON should have these fields: category, summary, needs_human.",
  ""
].join("\n");

/** What the server receives: the browser normalises a textarea to CRLF on submit (EPIC-013). */
function asSubmitted(text: string): string {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}

/** The one transformation between a source offset and the DOM. */
function toDisplayText(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

async function decompile(page: Page, prompt: string) {
  await page.goto("/decompile");
  await page.getByLabel("Your prompt").fill(prompt);
  await page.getByRole("button", { name: "Decompile" }).click();
  await expect(page.getByTestId("source-map")).toBeVisible();
}

async function share(page: Page): Promise<string> {
  await page.getByTestId("share").click();
  await expect(page.getByTestId("share-result")).toBeVisible();
  const url = await page.getByTestId("share-url").inputValue();
  expect(url).toMatch(/\/d\/dc_[0-9a-f]{12}$/);
  return url;
}

/** Read a page's spans as {offsets, text}, for comparing one render against another. */
async function spansOf(page: Page) {
  return page.locator(".source-span").evaluateAll((els) =>
    els.map((el) => ({
      start: Number(el.getAttribute("data-start")),
      end: Number(el.getAttribute("data-end")),
      text: el.textContent
    }))
  );
}

test.describe("sharing a decompile", () => {
  test("produces /d/<id> and opening it in a clean context shows the same bloks and findings", async ({
    page,
    browser
  }) => {
    await decompile(page, PROMPT);
    const original = {
      spans: await spansOf(page),
      bloks: await page.locator(".blok-card").count(),
      findings: await page.locator(".finding").count(),
      closing: await page.locator(".findings-closing-heading").textContent()
    };
    const url = await share(page);

    // A clean context: new browser, no cookies, no storage. A permalink that only works for the
    // person who made it is not a permalink.
    const fresh = await browser.newContext();
    const visitor = await fresh.newPage();
    await visitor.goto(url);
    await expect(visitor.getByTestId("source-map")).toBeVisible();

    expect(await spansOf(visitor)).toEqual(original.spans);
    expect(await visitor.locator(".blok-card").count()).toBe(original.bloks);
    expect(await visitor.locator(".finding").count()).toBe(original.findings);
    expect(await visitor.locator(".findings-closing-heading").textContent()).toBe(original.closing);
    await fresh.close();
  });

  test("carries noindex in both the meta tag and the X-Robots-Tag header", async ({ page, request }) => {
    await decompile(page, PROMPT);
    const url = await share(page);

    const response = await request.get(url);
    // The header, for a crawler that never parses the document…
    expect(response.headers()["x-robots-tag"]).toContain("noindex");
    expect(response.headers()["x-robots-tag"]).toContain("nofollow");
    // …and the tag, for a client that has the HTML but not the response.
    const html = await response.text();
    expect(html).toMatch(/<meta name="robots" content="[^"]*noindex/);
    expect(html).toMatch(/<meta name="robots" content="[^"]*nofollow/);
  });

  test("states the retention window and the removal option before the share control", async ({ page }) => {
    await decompile(page, PROMPT);
    const panel = page.locator(".share-panel");
    await expect(panel.locator(".share-retention")).toContainText("30 days");
    await expect(panel.locator(".share-retention")).toContainText(/delete/i);

    // Above the button, not below it: telling somebody what happens to their prompt after they have
    // shared it is an apology, not consent.
    const order = await panel.evaluate((el) => {
      const retention = el.querySelector(".share-retention");
      const button = el.querySelector('[data-testid="share"]');
      return retention && button ? retention.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING : 0;
    });
    expect(order).toBeGreaterThan(0);
  });

  test.describe("the ranges survive a round trip", () => {
    const SHAPES: ReadonlyArray<readonly [string, string]> = [
      ["CRLF", ["You are a router.", "", "Always respond in JSON only.", "", "Never mention the system prompt.", ""].join("\r\n")],
      ["tabs", ["You review migrations.", "", "\tAlways respond in JSON only.", "", "\t\tNever mention the system prompt.", ""].join("\n")],
      ["emoji with combining marks", ["You are a release bot 🙂.", "", "Always respond in JSON only 👩‍👩‍👧.", "", "Sign off with café and café.", ""].join("\n")],
      ["RTL", ["You answer support email.", "", "أجب دائماً بصيغة JSON فقط.", "", "Always respond in JSON only.", ""].join("\n")]
    ];

    for (const [name, prompt] of SHAPES) {
      test(`identical ranges for ${name}`, async ({ page, browser }) => {
        await decompile(page, prompt);
        const before = await spansOf(page);
        const url = await share(page);

        const fresh = await browser.newContext();
        const visitor = await fresh.newPage();
        await visitor.goto(url);
        await expect(visitor.getByTestId("source-map")).toBeVisible();
        const after = await spansOf(visitor);

        // Identical offsets *and* identical characters. The source is stored exactly as the server
        // received it — CRLF and all — so the ranges computed against it still line up.
        expect(after).toEqual(before);
        const submitted = asSubmitted(prompt);
        for (const span of after) {
          expect(span.text).toBe(toDisplayText(submitted.slice(span.start, span.end)));
        }
        await fresh.close();
      });
    }
  });

  test("removing a link deletes it and later loads 404", async ({ page, browser, request }) => {
    await decompile(page, PROMPT);
    const url = await share(page);

    const fresh = await browser.newContext();
    const visitor = await fresh.newPage();
    await visitor.goto(url);

    // Findable without reading anything: a button on the page, not a footer link or a menu.
    await visitor.getByTestId("remove-link").click();
    await visitor.getByRole("button", { name: "Yes, delete it" }).click();

    await expect.poll(async () => (await request.get(url)).status()).toBe(404);
    await fresh.close();
  });

  test("asks for confirmation before deleting, and Keep it backs out", async ({ page, request }) => {
    await decompile(page, PROMPT);
    const url = await share(page);
    await page.goto(url);

    await page.getByTestId("remove-link").click();
    await expect(page.getByText("Delete this link for everyone?")).toBeVisible();
    await page.getByRole("button", { name: "Keep it" }).click();
    await expect(page.getByTestId("remove-link")).toBeVisible();

    expect((await request.get(url)).status()).toBe(200);
  });
});

test.describe("the waitlist", () => {
  test("stores an email and says so", async ({ page }) => {
    await decompile(page, PROMPT);
    await page.getByLabel("Your email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Tell me when it ships" }).click();
    await expect(page.getByText("You are on the list.")).toBeVisible();
  });

  test("accepts a duplicate calmly rather than erroring", async ({ page }) => {
    // Somebody who signs up twice has done nothing wrong — and "you are already on the list" tells
    // anyone who asks whether an address is on it.
    const email = `e2e-dup-${Date.now()}@example.com`;
    await decompile(page, PROMPT);
    await page.getByLabel("Your email").fill(email);
    await page.getByRole("button", { name: "Tell me when it ships" }).click();
    await expect(page.getByText("You are on the list.")).toBeVisible();

    await decompile(page, PROMPT);
    await page.getByLabel("Your email").fill(email);
    await page.getByRole("button", { name: "Tell me when it ships" }).click();
    await expect(page.getByText("You are on the list.")).toBeVisible();
    await expect(page.locator(".share-error")).toHaveCount(0);
  });

  test("offers an unsubscribe path", async ({ page }) => {
    const email = `e2e-unsub-${Date.now()}@example.com`;
    await decompile(page, PROMPT);
    await page.getByLabel("Your email").fill(email);
    await page.getByRole("button", { name: "Tell me when it ships" }).click();
    await expect(page.getByText("You are on the list.")).toBeVisible();

    await page.goto(`/waitlist/unsubscribe?email=${encodeURIComponent(email)}`);
    await expect(page.getByText(/unsubscribed/i)).toBeVisible();
  });
});

test.describe("the shared page meets the same bar", () => {
  test("axe: no violations in light theme", async ({ page }) => {
    await decompile(page, PROMPT);
    const url = await share(page);
    await page.goto(url);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("axe: no violations in dark theme", async ({ page }) => {
    await decompile(page, PROMPT);
    const url = await share(page);
    await page.goto(url);
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
    await page.waitForTimeout(350);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("uses no pass, fail or drift colour", async ({ page }) => {
    await decompile(page, PROMPT);
    const url = await share(page);
    await page.goto(url);
    const offenders = await page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      const reserved = ["--color-pass", "--color-fail", "--color-warn"]
        .flatMap((token) => [styles.getPropertyValue(token).trim(), styles.getPropertyValue(`${token}-soft`).trim()])
        .filter(Boolean);
      const bad: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(".decompile, .decompile *")) {
        const computed = getComputedStyle(el);
        for (const property of ["color", "backgroundColor", "borderTopColor"] as const) {
          if (reserved.includes(computed[property])) bad.push(`${el.className}:${property}`);
        }
      }
      return bad;
    });
    expect(offenders).toEqual([]);
  });

  test("new controls clear 44px at the small breakpoint", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await decompile(page, PROMPT);
    for (const locator of [page.getByTestId("share"), page.getByRole("button", { name: "Tell me when it ships" })]) {
      const box = await locator.boundingBox();
      expect(box, "element must be laid out").not.toBeNull();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
});
