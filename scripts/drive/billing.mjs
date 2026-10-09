/* Drive: pricing on, Stripe test mode. Signs in, checks the price comes from
   Stripe, and opens Stripe Checkout with Managed Payments ("Sold through
   Link"). Needs a pricing-on build on :3141 with E2E_MODE=1:
     NEXT_DIST_DIR=.next-priced NEXT_PUBLIC_PRICING_ENABLED=true pnpm exec next build
     NEXT_DIST_DIR=.next-priced NEXT_PUBLIC_PRICING_ENABLED=true E2E_MODE=1 pnpm exec next start --port 3141
     stripe listen --forward-to localhost:3141/api/stripe/webhook
   Stripe's hosted page does not accept automated card submission, so paying
   with 4242 4242 4242 4242 is a step for a person (KEEP_OPEN=1 leaves the
   browser on Checkout). The webhook half is exercised through the API: see
   README, "Turning on Performance pricing". */
import { APP, check, launch, signInViaOutbox } from "./lib.mjs";

const { browser, page, shot, errors } = await launch("billing");
try {
  await signInViaOutbox(page, `billing-${Date.now()}@example.test`);
  await page.goto(`${APP}/settings#billing`);
  const card = page.locator("[class*=plancardPerf]");
  await card.getByText(/\$\d+/).waitFor();
  check(/\$\d+\s*\/ month/.test((await card.textContent()) ?? ""), "the Performance price comes from Stripe");
  await shot("billing-free");
  const ours = [...errors];
  await page.getByRole("button", { name: "Upgrade with Stripe" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30000, waitUntil: "domcontentloaded" });
  await page.getByText("Sold through").waitFor({ timeout: 30000 });
  check(await page.getByText("41prompts Performance").first().isVisible(), "Checkout shows the Performance product");
  await shot("checkout");
  check(ours.length === 0, `no console errors on our pages (${ours.join(" | ")})`);
  console.log("DRIVE PASS billing (pay with the test card by hand to finish)");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL billing:", e.message);
  process.exitCode = 1;
} finally {
  if (process.env.KEEP_OPEN !== "1") await browser.close();
}
