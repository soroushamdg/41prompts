/* Drive: design system kit. Run against a built app started with SHOW_KIT=1:
     pnpm build && SHOW_KIT=1 MAINTENANCE_MODE=0 pnpm start
     node scripts/drive/m02-kit.mjs            (DRIVE_HEADLESS=1 to hide the browser) */
import { APP, assertStyled, check, launch } from "./lib.mjs";

const { browser, page, shot, errors } = await launch("m02-kit");
try {
  await page.goto(`${APP}/kit`);
  await assertStyled(page);
  check(await page.locator("h1").textContent() === "Component kit", "kit renders");
  const archivo = await page.evaluate(() => getComputedStyle(document.querySelector("h1")).fontFamily);
  check(/archivo/i.test(archivo), `display font applied (${archivo})`);
  await page.waitForTimeout(1600); // logo plays 41 → AI → 41 on load
  await shot("kit");
  await page.locator(".logo").first().hover();
  await page.waitForTimeout(700);
  check(await page.locator(".logo").first().evaluate((el) => el.classList.contains("is-on")), "logo morphs to AI on hover");
  await shot("logo-hover");
  await page.mouse.move(700, 600);
  await page.getByRole("button", { name: "Lint" }).click();
  await page.waitForTimeout(700);
  check(await page.locator("dialog.dlg[open]").isVisible(), "locked control opens the upgrade sheet");
  check((await page.locator("#upgradeTitle").textContent()).includes("The linter is part of Performance"), "sheet names the feature");
  check(!(await page.locator("dialog.dlg[open]").textContent()).includes("$"), "no price with pricing off");
  await shot("upgrade-sheet");
  await page.getByRole("button", { name: "Tell me when it opens" }).click();
  await page.waitForTimeout(500);
  check(await page.getByText("Noted. We will email you when it opens.").isVisible(), "interest is recorded");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Toast with Undo" }).click();
  await page.waitForTimeout(500);
  check(await page.locator(".toast.is-on").isVisible(), "toast shows");
  await shot("toast");
  await page.getByRole("tab", { name: "Run" }).focus();
  await page.keyboard.press("ArrowRight");
  check(await page.getByRole("tab", { name: "History · 7" }).getAttribute("aria-selected") === "true", "tabs move with arrow keys");
  await page.locator("summary.avatar").click();
  check(await page.locator(".menu[open]").count() === 1, "menu opens");
  await page.keyboard.press("Escape");
  check(await page.locator(".menu[open]").count() === 0, "menu closes on Escape");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  console.log("DRIVE PASS m02-kit");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m02-kit:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
