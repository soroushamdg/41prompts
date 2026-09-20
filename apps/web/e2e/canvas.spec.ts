import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor } from "./db";

const PHONE = { width: 375, height: 812 };

/**
 * **One sign-in for the whole file, reused as saved storage state.**
 *
 * Magic links are rate limited to 15 per IP per five minutes (`lib/auth.ts`). An earlier version of
 * this spec signed in per test — nine links from this file alone — which, on top of `auth.spec.ts`'s
 * own, exhausted the budget partway through `pnpm e2e`: the last two tests failed on a verify URL
 * that never redirected. It read as a canvas bug and was a rate limit.
 *
 * So: one link for the owner, plus one more in the single test that genuinely needs a second person.
 */
const OWNER_EMAIL = `canvas-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-canvas-")), "owner.json");

/**
 * Written empty at load, then overwritten by the sign-in hook.
 *
 * `test.use({ storageState })` sets the context options for the worker, including the
 * `browser.newContext()` inside the very `beforeAll` that creates the file — so without this the
 * hook fails reading a file it is about to write, and nesting the `use` one level deeper does not
 * separate them. An empty-but-valid state is the simplest thing that is always true.
 */
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

/** The same flow `auth.spec.ts` uses, landing on the projects list rather than `/app`. */
async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?next=%2Fapp%2Fprojects");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();

  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await expect(page).toHaveURL(/\/app\/projects/);
}

/** A fresh project and prompt for one test, so tests never share a canvas. */
async function newPrompt(page: Page): Promise<string> {
  await page.goto("/app/projects");
  await page.getByLabel("New project").fill(`Canvas ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);

  await page.getByLabel("New prompt").fill("Refund classifier");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
  return page.url();
}

/**
 * Wait for *this* edit to be saved, not for a "Saved" left over from the last one.
 *
 * The editor drops back to `idle` on every keystroke, so `data-state="saved"` after a `fill` can
 * only mean the write that covers this text. Asserting on the visible word alone passed instantly
 * against a stale "Saved" and let an unsaved edit through — which the round-trip test caught.
 */
async function expectSaved(page: Page, index: number): Promise<void> {
  await expect(
    page.locator(".canvas-list > li").nth(index).locator(".blok-editor-state")
  ).toHaveAttribute("data-state", "saved");
}

/**
 * Open a card's editor, if it is not already the open one.
 *
 * **EPIC-024 made a card compact**: at rest it shows a two-line summary, and selecting it opens the
 * textarea in place. One card is open at a time, so reaching any other blok's text means asking for
 * it. The summary carries the same accessible name the card always had, prefixed so a screen reader
 * says what activating it does.
 */
async function openBlok(page: Page, index: number): Promise<void> {
  const card = page.locator(".canvas-list > li").nth(index);
  if ((await card.getByLabel("Blok text").count()) === 0) {
    await card.getByRole("button", { name: /^Edit this blok/ }).click();
  }
  await expect(card.getByLabel("Blok text")).toBeVisible();
}

async function setBlokText(page: Page, index: number, text: string): Promise<void> {
  await openBlok(page, index);
  await page.locator(".canvas-list > li").nth(index).getByLabel("Blok text").fill(text);
  await expectSaved(page, index);
}

async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  // **The kind picker, since EPIC-024.** Six `Add <kind>` buttons became one `+ Add blok` menu.
  // The item labels are unchanged on purpose — a menu item is a button with the same accessible
  // name, so changing the wording would have been a rename across a dozen specs for no reader's
  // benefit. What changed is that it has to be opened first.
  await page.getByRole("button", { name: "+ Add blok" }).click();
  await page.getByRole("menuitem", { name: `Add ${kind}` }).click();
  await expect(page.locator(".canvas-list > li")).toHaveCount(before + 1);
  await setBlokText(page, before, text);
}

test.describe("the blok canvas", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    await signIn(await context.newPage(), OWNER_EMAIL);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    await deleteTestUser(OWNER_EMAIL);
  });

  test.describe("signed in as its owner", () => {
    test.use({ storageState: STATE_FILE });

    /**
     * Criterion 1, as one test, because the criterion is one sentence: create, add four, reorder,
     * edit, delete, undo, and **all of it survives a reload**. Split into six tests it would pass
     * while the persistence was broken — and it did catch exactly that, twice.
     */
    test("create, add, reorder, edit, delete, undo — and it all persists across a reload", async ({
      page
    }) => {
      const url = await newPrompt(page);

      await addBlok(page, "context", "You route inbound support email.");
      await addBlok(page, "constraint", "Reply in at most 80 words.");
      await addBlok(page, "example", "Input: charged twice / Output: billing");
      await addBlok(page, "expected", "Respond with valid JSON.");

      // Reorder: the second card up, so the order becomes constraint, context, example, expected.
      await page
        .locator(".canvas-list > li")
        .nth(1)
        .getByRole("button", { name: "Move up" })
        .click();
      await expect(page.locator(".canvas-list > li").first()).toContainText("Constraint");

      await setBlokText(page, 1, "You route inbound support email, fast.");

      await page
        .locator(".canvas-list > li")
        .nth(2)
        .getByRole("button", { name: "Delete" })
        .click();
      await expect(page.locator(".canvas-list > li")).toHaveCount(3);
      await page.getByRole("button", { name: "Undo delete" }).click();
      await expect(page.locator(".canvas-list > li")).toHaveCount(4);

      await page.reload();

      // **Read the summaries, not the textareas** (EPIC-024). A compact card shows its text at
      // rest and opens on selection, so after a reload there are no fields to read — and asking
      // the summaries is the better assertion anyway: it proves the order is *visible*, which is
      // what somebody scanning the canvas actually gets, rather than what four open inputs hold.
      const summaries = await page
        .locator(".canvas-list > li")
        .getByRole("button", { name: /^Edit this blok/ })
        .allInnerTexts();
      // The summary's accessible name begins with a visually-hidden "Edit this blok: ", which is
      // what makes the control say aloud what activating it does. It is not part of the blok.
      expect(summaries.map((text) => text.replace(/^Edit this blok:\s*/, "").trim())).toEqual([
        "Reply in at most 80 words.",
        "You route inbound support email, fast.",
        "Input: charged twice / Output: billing",
        "Respond with valid JSON."
      ]);
      expect(page.url()).toBe(url);
    });

    /** Criterion 2. 404, not 403 — a 403 confirms the id is real. */
    test("another user asking for the prompt by id gets 404, not 403", async ({
      page,
      browser
    }) => {
      const url = await newPrompt(page);
      const other = `canvas-other-${Date.now()}@example.test`;

      const context = await browser.newContext();
      try {
        const otherPage = await context.newPage();
        await signIn(otherPage, other);
        const response = await otherPage.goto(url);
        expect(response?.status()).toBe(404);
      } finally {
        await context.close();
        await deleteTestUser(other);
      }
    });

    test.describe("autosave", () => {
      test("text survives a reload, byte for byte", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "Stored byte for byte:\ttabbed, 🚀, مرحبا");

        await page.reload();
        // **The card is closed after a reload**, which is EPIC-024's compact canvas working: one
        // card is open at a time and a fresh page has none. What the test is about is unchanged —
        // the bytes survived — so it opens the card and asks.
        await openBlok(page, 0);
        await expect(page.getByLabel("Blok text")).toHaveValue(
          "Stored byte for byte:\ttabbed, 🚀, مرحبا"
        );

        // And the summary shows them too, without opening anything: a closed card is not a card
        // whose text you have to take on trust.
        await page.reload();
        await expect(page.locator(".canvas-list > li").first()).toContainText("tabbed, 🚀, مرحبا");
      });

      /**
       * **The failure path, which is the one that matters.** A save that fails must not take the typed
       * text with it, and must not quietly replace it with whatever the server last knew.
       */
      test("a failed write shows a message and leaves the typed text in the field", async ({
        page
      }) => {
        await newPrompt(page);
        await addBlok(page, "context", "Saved fine.");

        // Every server action posts to the current URL; failing them all is the bluntest honest way
        // to simulate the network going away mid-sentence.
        await page.route("**/app/pr/**", (route) =>
          route.request().method() === "POST" ? route.abort("failed") : route.continue()
        );

        const field = page.getByLabel("Blok text");
        await field.fill("A sentence somebody cares about.");

        await expect(page.getByText(/Not saved/)).toBeVisible();
        // Still theirs. This is the assertion the whole component exists for.
        await expect(field).toHaveValue("A sentence somebody cares about.");
      });
    });

    test.describe("accessibility and touch", () => {
      test("reorders by keyboard alone, announcing the new position", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "first");
        await addBlok(page, "constraint", "second");

        // Tab to the second card's move controls and use the arrow accelerator. A keyboard user
        // reaches these buttons; the card itself is not a control and must not be focusable.
        await page
          .locator(".canvas-list > li")
          .nth(1)
          .getByRole("button", { name: "Move up" })
          .focus();
        await page.keyboard.press("ArrowUp");

        await expect(page.locator(".canvas-list > li").first()).toContainText("Constraint");
        await expect(page.locator("[aria-live='polite']")).toContainText(
          "Moved to position 1 of 2"
        );
      });

      for (const theme of ["light", "dark"] as const) {
        test(`axe is clean on the canvas in the ${theme} theme`, async ({ page }) => {
          await newPrompt(page);
          await addBlok(page, "context", "You route inbound support email.");
          await page.evaluate(
            (value) => document.documentElement.setAttribute("data-theme", value),
            theme
          );
          // base.css transitions `background` over 0.3s. Running axe immediately measures a blended
          // mid-transition colour — it reported ink-3 on #383836, which is neither theme's ground —
          // and reads as a contrast failure that does not exist. `landing.spec.ts` waits for the same
          // reason.
          await page.waitForTimeout(350);

          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
        });
      }

      test("every control on the canvas clears 44px on a phone", async ({ page }) => {
        await page.setViewportSize(PHONE);
        await newPrompt(page);
        await addBlok(page, "context", "first");

        for (const locator of await page.locator(".canvas button, .app-list a").all()) {
          const box = await locator.boundingBox();
          if (box === null) continue;
          expect(
            box.height,
            `${await locator.innerText()} is under the 44px minimum`
          ).toBeGreaterThanOrEqual(44);
        }
      });

      test("reduced motion shows the card's end state rather than skipping it", async ({
        page
      }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await newPrompt(page);
        await addBlok(page, "context", "first");

        const card = page.locator(".blok-card").first();
        await card.hover();
        // The end state is the offset shadow; reduced motion keeps it and drops the transition.
        await expect(card).toHaveCSS("transition-property", "none");
        expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
      });
    });

    /**
     * Criterion 9, measured **inside the page, click to painted frame**.
     *
     * Driving it through Playwright's `.click()` and waiting on a locator measures Playwright as much
     * as the app — its actionability checks and scroll-into-view on a 60-card page cost tens of
     * milliseconds nobody at the keyboard experiences. `docs/PROCESS.md` is blunt about budgets that
     * end up measuring the runner. Both numbers are logged either way.
     */
    test("a 60-blok canvas renders and reorders without an interaction over 100 ms", async ({
      page
    }) => {
      test.slow();
      const url = await newPrompt(page);

      // **Wait for each add before making the next one.** Firing sixty clicks and then asserting the
      // count leaves sixty server actions in flight against a single assertion's timeout: it passes
      // on a fast machine and fails on a slow one, which is exactly what CI did — the count was
      // climbing steadily (29, 30, 33 … 51) and simply had not arrived. Awaiting each one is
      // deterministic rather than a widened bar, and it is also what a person does.
      for (let i = 0; i < 60; i++) {
        await page.getByRole("button", { name: "+ Add blok" }).click();
        await page.getByRole("menuitem", { name: "Add context" }).click();
        await expect(page.locator(".canvas-list > li")).toHaveCount(i + 1);
      }

      await page.goto(url);
      const rendered = await page.evaluate(() => {
        const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return entry.domContentLoadedEventEnd - entry.responseStart;
      });

      const driven = Date.now();
      await page
        .locator(".canvas-list > li")
        .nth(30)
        .getByRole("button", { name: "Move up" })
        .click();
      await expect(page.locator("[aria-live='polite']")).toContainText(
        "Moved to position 30 of 60"
      );
      const throughPlaywright = Date.now() - driven;

      const reorder = await page.evaluate(async () => {
        const card = document.querySelectorAll(".canvas-list > li")[40]!;
        const up = [...card.querySelectorAll("button")].find((button) =>
          button.textContent?.includes("Move up")
        )!;
        const started = performance.now();
        up.click();
        // Two frames: the first is when React commits, the second is when it is on screen.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return performance.now() - started;
      });

      console.log(
        `60-blok canvas: first render ${rendered.toFixed(0)} ms, reorder ${reorder.toFixed(0)} ms ` +
          `click-to-paint (${throughPlaywright} ms including Playwright's own click overhead)`
      );
      expect(reorder).toBeLessThan(100);
    });
  });
});
