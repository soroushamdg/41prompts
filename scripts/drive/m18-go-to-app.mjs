/* Drive: signed-in visitors get "Go to app" on the landing page. Built app
   with E2E_MODE=1. Locally the app (localhost) and the site (site.localhost)
   share no parent domain, so after checking the app sets its hint, the drive
   copies it to the site host the way the shared domain does in production. */
import { APP, assertStyled, check, launch, SITE, signInViaOutbox } from "./lib.mjs";

const { browser, context, page, shot, errors } = await launch("m18-go-to-app");
try {
  await page.goto(`${SITE}/`);
  await assertStyled(page);
  await page.waitForTimeout(1200);
  await shot("signed-out");
  check(await page.locator("header").first().getByRole("link", { name: "Sign in" }).isVisible(), "signed out: Sign in shows");

  await signInViaOutbox(page, `go-${Date.now()}@example.test`);
  const hint = (await context.cookies(APP)).find((c) => c.name === "41p_app");
  check(hint?.value === "1" && !hint.httpOnly, "the app sets the signed-in hint after sign-in");
  await context.addCookies([{ name: "41p_app", value: "1", url: SITE }]);

  // The morph: capture a few frames around it.
  await page.goto(`${SITE}/`);
  const t0 = Date.now();
  for (const at of [380, 560, 700, 860, 1200]) {
    await page.waitForTimeout(Math.max(0, at - (Date.now() - t0)));
    await shot(`morph-${at}ms`);
  }
  const go = page.locator("header").first().getByRole("link", { name: "Go to app" });
  await go.waitFor();
  check((await page.getByRole("link", { name: "Start free" }).count()) === 0, "no Start free left");
  await page.getByRole("link", { name: "Go to app" }).nth(1).hover();
  await page.waitForTimeout(600);
  await shot("hero-hover");
  await go.hover();
  await page.waitForTimeout(600);
  await shot("header-hover");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${SITE}/`);
  await page.waitForTimeout(1600);
  await shot("phone");
  await page.setViewportSize({ width: 1440, height: 900 });

  await page.goto(`${SITE}/`);
  await page.locator("header").first().getByRole("link", { name: "Go to app" }).click();
  await page.waitForURL(`${APP}/`);
  check(await page.getByRole("heading", { name: "Library", exact: true }).isVisible(), "Go to app opens the library");
  check(errors.length === 0, `no console errors (${errors.join(" | ")})`);
  console.log("DRIVE PASS m18-go-to-app");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m18-go-to-app:", e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
