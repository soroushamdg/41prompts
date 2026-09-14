import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { deleteTestUser, latestMagicLinkTokenFor } from "./db";

const PHONE = { width: 375, height: 812 };

/** One sign-in for the file, as `canvas.spec.ts` does — magic links are rate limited per IP. */
const OWNER_EMAIL = `pane-owner-${Date.now()}@example.test`;
const STATE_FILE = join(mkdtempSync(join(tmpdir(), "41p-pane-")), "owner.json");
writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }));

async function signIn(page: Page, email: string): Promise<void> {
  await page.goto("/sign-in?next=%2Fapp%2Fprojects");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toBeVisible();
  const token = await latestMagicLinkTokenFor(email);
  await page.goto(`/api/auth/magic-link/verify?token=${token}&callbackURL=%2Fapp%2Fprojects`);
  await expect(page).toHaveURL(/\/app\/projects/);
}

async function newPrompt(page: Page): Promise<string> {
  await page.goto("/app/projects");
  await page.getByLabel("New project").fill(`Pane ${Date.now()}`);
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page).toHaveURL(/\/app\/p\/proj_[0-9a-f]{4}/);
  await page.getByLabel("New prompt").fill("Refund classifier");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await expect(page).toHaveURL(/\/app\/pr\/pr_[0-9a-f]{8}/);
  return page.url();
}

async function addBlok(page: Page, kind: string, text: string): Promise<void> {
  const before = await page.locator(".canvas-list > li").count();
  await page.getByRole("button", { name: `Add ${kind}` }).click();
  await expect(page.locator(".canvas-list > li")).toHaveCount(before + 1);
  await page.locator(".canvas-list > li").nth(before).getByLabel("Blok text").fill(text);
  await expect(
    page.locator(".canvas-list > li").nth(before).locator(".blok-editor-state")
  ).toHaveAttribute("data-state", "saved");
  // **No reload.** There was one here, and it hid BUG-021b-compiled-pane-stale from every test in
  // this file — the pane rendered an empty span and the reload refilled it from the server.
  // `PROCESS.md`, "A helper that normalises state hides the defect from every test that uses it".
}

/** Take a span by hand, through the pane, the way a person does. */
async function editSpanByHand(page: Page, index: number, text: string): Promise<void> {
  await page.locator(".compiled-notes > div").nth(index).getByRole("button", { name: "Edit by hand" }).click();
  await page.getByLabel("Edit this span by hand").fill(text);
  await page.getByRole("button", { name: "Save this span" }).click();
  await expect(page.locator(".compiled-span").nth(index)).toHaveAttribute("data-presentation", "edited");
}

test.describe("the compiled pane", () => {
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
     * **BUG-021b-compiled-pane-stale, named so nobody puts the reload back.**
     *
     * The span element appeared as soon as a blok was added — `addBlokAction` revalidates — and then
     * rendered **empty**, because `saveBlokTextAction` did not. Editing the text never reached the
     * pane either. `addBlok` reloaded, so every test in this file read a fresh server render and saw
     * text that a person using the app would not have seen.
     *
     * Asserted on the text itself, not on the span count: a count of 1 was true throughout the bug.
     */
    test("a blok's text reaches its span without reloading the page", async ({ page }) => {
      await newPrompt(page);
      await addBlok(page, "context", "FIRST TEXT");
      await expect(page.locator(".compiled-span").first()).toHaveText("FIRST TEXT");

      // And a later edit to the same blok follows, which is the half a reload also hid.
      await page.locator(".canvas-list > li").first().getByLabel("Blok text").fill("SECOND TEXT, CHANGED");
      await expect(
        page.locator(".canvas-list > li").first().locator(".blok-editor-state")
      ).toHaveAttribute("data-state", "saved");
      await expect(page.locator(".compiled-span").first()).toHaveText("SECOND TEXT, CHANGED");
    });

    test("renders one element per span, each carrying its blok id and state", async ({ page }) => {
      await newPrompt(page);
      await addBlok(page, "context", "You route inbound support email.");
      await addBlok(page, "constraint", "Reply in at most 80 words.");

      const spans = page.locator(".compiled-span");
      await expect(spans).toHaveCount(2);
      for (let i = 0; i < 2; i++) {
        await expect(spans.nth(i)).toHaveAttribute("data-blok", /^blok_[0-9a-f]{16}$/);
        await expect(spans.nth(i)).toHaveAttribute("data-presentation", "in-step");
      }
      // An expected blok emits no text, so it owns no span.
      await addBlok(page, "expected", "Returns valid JSON.");
      await expect(page.locator(".compiled-span")).toHaveCount(2);
    });

    test.describe("linking", () => {
      test("hovering a span surfaces its card", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "You route inbound support email.");
        await page.locator(".compiled-span").first().hover();
        await expect(page.locator(".blok-card").first()).toHaveAttribute("data-selected", "true");
      });

      test("hovering a card highlights its span", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "You route inbound support email.");
        await page.locator(".blok-card").first().hover();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-linked", "true");
      });

      test("pinning survives the pointer moving away", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "First.");
        await addBlok(page, "constraint", "Second.");

        await page.locator(".compiled-span").first().click();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-pinned", "true");
        // Move the pointer somewhere else entirely; the pin must hold.
        await page.locator(".compiled-span").nth(1).hover();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-pinned", "true");
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-linked", "true");
      });

      test("Escape and a second tap both unpin", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "First.");

        const span = page.locator(".compiled-span").first();
        await span.click();
        await expect(span).toHaveAttribute("data-pinned", "true");
        await span.press("Escape");
        await expect(span).not.toHaveAttribute("data-pinned", "true");

        await span.click();
        await expect(span).toHaveAttribute("data-pinned", "true");
        await span.click();
        await expect(span).not.toHaveAttribute("data-pinned", "true");
      });
    });

    test.describe("hand editing", () => {
      test("marks the span edited by hand at the moment of the edit", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "constraint", "Reply in at most 80 words.");

        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-presentation", "in-step");
        await editSpanByHand(page, 0, "Reply briefly, and never hedge.");
        await expect(page.getByText("You wrote this span.")).toBeVisible();
      });

      test("stores the text verbatim — no trimming, no normalisation", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "constraint", "Reply in at most 80 words.");

        const awkward = "  Reply\tbriefly 🚀  \n  and keep the spaces.  ";
        await editSpanByHand(page, 0, awkward);
        await page.reload();
        // "Edit again" once a span has been taken by hand — the entry into your own text stays open.
        await page.locator(".compiled-notes > div").first().getByRole("button", { name: "Edit again" }).click();
        await expect(page.getByLabel("Edit this span by hand")).toHaveValue(awkward);
      });
    });

    test.describe("update from blok", () => {
      test("returns exactly that span to compiled and touches no other", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "You route inbound support email.");
        await addBlok(page, "constraint", "Reply in at most 80 words.");

        await editSpanByHand(page, 0, "Hand written first span.");
        await editSpanByHand(page, 1, "Hand written second span.");

        await page.locator(".compiled-notes > div").first().getByRole("button", { name: "Update from blok" }).click();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-presentation", "in-step");
        // The other one is untouched.
        await expect(page.locator(".compiled-span").nth(1)).toHaveAttribute("data-presentation", "edited");
        await expect(page.locator(".compiled-span").nth(1)).toContainText("Hand written second span.");
      });

      test("undo restores the hand edit", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "constraint", "Reply in at most 80 words.");
        await editSpanByHand(page, 0, "Hand written, and worth keeping.");

        await page.locator(".compiled-notes > div").first().getByRole("button", { name: "Update from blok" }).click();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-presentation", "in-step");

        await page.getByRole("button", { name: "Undo update from blok" }).click();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-presentation", "edited");
        await expect(page.locator(".compiled-span").first()).toContainText("Hand written, and worth keeping.");

        // And it survives a reload, so the retained hash went back too rather than being approximated.
        await page.reload();
        await expect(page.locator(".compiled-span").first()).toHaveAttribute("data-presentation", "edited");
      });

      test("offers no bulk update anywhere on the route", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "First.");
        await addBlok(page, "constraint", "Second.");
        await editSpanByHand(page, 0, "Hand written first.");
        await editSpanByHand(page, 1, "Hand written second.");

        // Each one is a separate decision because each discards something a person wrote.
        await expect(page.getByRole("button", { name: "Update from blok" })).toHaveCount(2);
        for (const bulk of [/update all/i, /update every/i, /reconcile/i]) {
          await expect(page.getByRole("button", { name: bulk })).toHaveCount(0);
        }
      });
    });

    /**
     * **The requirement carried out of EPIC-020 and through EPIC-021a, driven through the UI.**
     *
     * The model version and the database version both pass; this is the one that exercises the path
     * a person actually takes, which is where the silent loss would happen.
     */
    test("a hand edit survives adding an unrelated blok", async ({ page }) => {
      await newPrompt(page);
      await addBlok(page, "context", "You route inbound support email.");
      await addBlok(page, "constraint", "Reply in at most 80 words.");

      await editSpanByHand(page, 1, "Reply in at most 60 words, and never hedge.");

      // Add an unrelated blok from the canvas, exactly as somebody would.
      await page.getByRole("button", { name: "Add constraint" }).click();
      await expect(page.locator(".canvas-list > li")).toHaveCount(3);
      await page.reload();

      const edited = page.locator(".compiled-span").nth(1);
      await expect(edited).toHaveAttribute("data-presentation", "edited");
      await expect(edited).toContainText("Reply in at most 60 words, and never hedge.");
    });

    test("copy produces exactly what the model would receive, separators included", async ({ page, context }) => {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await newPrompt(page);
      await addBlok(page, "context", "You route inbound support email.");
      await addBlok(page, "constraint", "Reply in at most 80 words.");

      await page.getByRole("button", { name: "Copy prompt" }).click();
      await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();

      const copied = await page.evaluate(() => navigator.clipboard.readText());
      // Byte for byte against what compile() produces: blok text, blank line, blok text, blank line.
      expect(copied).toBe("You route inbound support email.\n\nReply in at most 80 words.\n\n");
    });

    test.describe("accessibility", () => {
      for (const theme of ["light", "dark"] as const) {
        test(`axe is clean on the pane in the ${theme} theme`, async ({ page }) => {
          await newPrompt(page);
          await addBlok(page, "context", "You route inbound support email.");
          await editSpanByHand(page, 0, "Hand written, so a state note is on screen.");
          await page.evaluate((value) => document.documentElement.setAttribute("data-theme", value), theme);
          await page.waitForTimeout(350);

          const results = await new AxeBuilder({ page }).analyze();
          expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([]);
        });
      }

      test("every span is reachable and pinnable by keyboard alone", async ({ page }) => {
        await newPrompt(page);
        await addBlok(page, "context", "First.");

        const span = page.locator(".compiled-span").first();
        await span.focus();
        await expect(span).toBeFocused();
        await expect(span).toHaveAttribute("data-linked", "true");
        await page.keyboard.press("Enter");
        await expect(span).toHaveAttribute("data-pinned", "true");
        await page.keyboard.press("Escape");
        await expect(span).not.toHaveAttribute("data-pinned", "true");
      });

      test("the pane's controls clear 44px on a phone", async ({ page }) => {
        await page.setViewportSize(PHONE);
        await newPrompt(page);
        await addBlok(page, "constraint", "Reply in at most 80 words.");
        await editSpanByHand(page, 0, "Hand written.");

        // Spans included: a span *is* a touch target — tapping one links it — and EPIC-013 holds its
        // source-map spans to the same bar rather than claiming the inline exception. The line it
        // sits on provides the height, which is why `canvas.css` opens the leading at this
        // breakpoint exactly as `decompile.css` does.
        for (const locator of await page.locator(".compiled-pane button, .span-state-note button").all()) {
          const box = await locator.boundingBox();
          if (box === null) continue;
          const height = Math.round(box.height * 100) / 100;
          expect(height, `${await locator.innerText()} is under the 44px minimum`).toBeGreaterThanOrEqual(44);
        }
      });

      test("reduced motion shows end states rather than skipping them", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await newPrompt(page);
        await addBlok(page, "context", "First.");

        const card = page.locator(".blok-card").first();
        await card.hover();
        await expect(card).toHaveCSS("transition-property", "none");
        expect(await card.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
      });
    });
  });
});
