import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function setTheme(page: Page, theme: "light" | "dark") {
  await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
  // The theme-switch colour transition (base.css) is 0.3s; let it finish so a screenshot doesn't
  // capture a blended in-between frame.
  await page.waitForTimeout(350);
}

test.describe("design system gallery (/dev/ui)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dev/ui");
  });

  test("axe: no violations in light theme", async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  test("axe: no violations in dark theme", async ({ page }) => {
    await setTheme(page, "dark");
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
  });

  // maxDiffPixelRatio: the baseline was generated inside mcr.microsoft.com/playwright:v1.63.0-noble
  // (matching CI's ubuntu-latest platform, since this repo has no macOS runner) rather than on
  // GitHub's actual runner image, and font hinting/anti-aliasing differs by a few hundred pixels
  // (~0.02% of the page) between the two even on the same OS family. A real regression — wrong
  // colour, missing component, layout shift — moves thousands to millions of pixels, not hundreds.
  // **Linux only**, for the reason EPIC-016 documented after being caught by it: on macOS Playwright
  // does not compare against the committed `-linux` baseline, it silently writes a new `-darwin` one
  // and passes — leaving untracked PNGs that look like evidence. CI is Linux and is where this means
  // something. `UPDATE_VISUAL=1` bypasses it for regeneration.
  //
  // Its own `describe` so the skip covers exactly these two: a bare `test.skip(condition)` applies to
  // every test in the enclosing block, which took the axe and keyboard tests with it.
  test.describe("visual regression", () => {
    test.skip(
      process.platform !== "linux" && process.env.UPDATE_VISUAL === undefined,
      "visual baselines are Linux-only — see EPIC-016's report"
    );

    test("visual regression: light theme", async ({ page }) => {
      await expect(page).toHaveScreenshot("gallery-light.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
    });

    test("visual regression: dark theme", async ({ page }) => {
      await setTheme(page, "dark");
      await expect(page).toHaveScreenshot("gallery-dark.png", { fullPage: true, maxDiffPixelRatio: 0.01 });
    });
  });

  test("keyboard: Button is reachable and activatable by keyboard, with a visible focus ring", async ({ page }) => {
    const button = page.getByRole("button", { name: "Compile" });
    await button.focus();
    await expect(button).toBeFocused();
    await expect(button).toHaveCSS("outline-style", "solid");
  });

  test("keyboard: BlokCard is a real button, reachable and activatable by keyboard", async ({ page }) => {
    const card = page.getByRole("button", { name: /No prose outside the JSON object/ });
    await card.focus();
    await expect(card).toBeFocused();
  });

  test("keyboard: Switch toggles with the keyboard, not just a click", async ({ page }) => {
    const toggle = page.getByRole("switch", { name: "Enable sandbox mode" });
    await toggle.focus();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.keyboard.press("Space");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("keyboard: Tabs moves focus and selection with arrow keys, Home/End jump to the ends", async ({ page }) => {
    const importTab = page.getByRole("tab", { name: "Import" });
    const composeTab = page.getByRole("tab", { name: "Compose" });
    const testTab = page.getByRole("tab", { name: "Test" });

    await importTab.focus();
    await page.keyboard.press("ArrowRight");
    await expect(composeTab).toBeFocused();
    await expect(composeTab).toHaveAttribute("aria-selected", "true");
    await expect(importTab).toHaveAttribute("aria-selected", "false");

    await page.keyboard.press("End");
    await expect(testTab).toBeFocused();
    await expect(testTab).toHaveAttribute("aria-selected", "true");

    await page.keyboard.press("Home");
    await expect(importTab).toBeFocused();
    await expect(importTab).toHaveAttribute("aria-selected", "true");
  });

  test("keyboard: Sheet opens on activation, traps focus, and Escape closes it", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Create constraint from failure" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toBeFocused();
  });

  test("keyboard: Dropdown opens with the keyboard and arrow keys move between items", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Actions" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();

    // Radix auto-focuses the first item shortly after the menu mounts, but the hand-off's timing
    // isn't part of the contract this test cares about (and is measurably slower the more pages a
    // single browser process has already opened in this run — a test-runner-process artifact, not
    // a real user's experience). What matters for keyboard operability is that every item is
    // reachable and ordered correctly via ArrowDown regardless of exactly when that hand-off
    // lands, so drive from whichever of the two legitimate starting states shows up.
    async function focusedText() {
      return page.evaluate(() => document.activeElement?.textContent ?? "");
    }
    if ((await focusedText()) !== "Duplicate") {
      await page.keyboard.press("ArrowDown");
    }
    await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Export" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("keyboard: Popover opens with the keyboard", async ({ page }) => {
    const trigger = page.getByRole("button", { name: "Cost breakdown" });
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("1,284 tokens")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  });

  test("keyboard: ThemeToggle is reachable and flips the theme", async ({ page }) => {
    const toggle = page.getByRole("button", { name: "Theme" });
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });

  test("reduced motion: Switch still shows the state change, just without animating it", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.reload();
    const toggle = page.getByRole("switch", { name: "Enable sandbox mode" });
    const thumb = toggle.locator(".switch-thumb");
    const before = await thumb.boundingBox();
    await toggle.click();
    // No waiting for a transition — reduced motion means the end state is already there.
    const after = await thumb.boundingBox();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(after!.x).toBeGreaterThan(before!.x);
    const transitionDuration = await thumb.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(transitionDuration).toBe("0s");
  });

  test("theme persists across reload with no flash: a dark cookie renders data-theme=dark in the initial HTML", async ({ page, context }) => {
    await context.addCookies([{ name: "41p-theme", value: "dark", url: page.url() || "http://localhost:3000" }]);
    const response = await page.goto("/dev/ui");
    const html = await response!.text();
    expect(html).toContain('data-theme="dark"');
    // No-flash script only ships for visitors without a cookie yet.
    expect(html).not.toContain("prefers-color-scheme: dark");
  });
});

test.describe("design system gallery — touch targets", () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test("every interactive control is at least 44px on its smallest axis at a small viewport", async ({ page }) => {
    await page.goto("/dev/ui");
    const gallery = page.locator("main");
    const selectors = ['button:visible', '[role="switch"]:visible', '[role="tab"]:visible', "input:visible"];
    for (const selector of selectors) {
      const handles = await gallery.locator(selector).all();
      for (const handle of handles) {
        const box = await handle.boundingBox();
        if (!box) continue;
        const smallestAxis = Math.min(box.width, box.height);
        expect(smallestAxis, `${selector} -> ${await handle.textContent()}`).toBeGreaterThanOrEqual(44);
      }
    }
  });
});
