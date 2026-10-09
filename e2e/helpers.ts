import { existsSync, readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

/** The newest sign-in link sent to this address, read from the e2e outbox. */
export async function latestLink(email: string, after = 0): Promise<string> {
  let link: string | null = null;
  await expect
    .poll(
      () => {
        if (!existsSync(".e2e/outbox.jsonl")) return null;
        const mails = readFileSync(".e2e/outbox.jsonl", "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as { to: string; text: string; at: string })
          .filter((m) => m.to === email && Date.parse(m.at) >= after);
        const last = mails.at(-1);
        link = last ? (last.text.match(/https?:\/\/\S+/)?.[0] ?? null) : null;
        return link;
      },
      { timeout: 15_000 },
    )
    .not.toBeNull();
  return link!;
}

let n = 0;
export function uniqueEmail(tag = "e2e") {
  n += 1;
  return `${tag}-${Date.now().toString(36)}-${n}@example.test`;
}

/** Signs in through the real magic-link flow and lands on the library. */
export async function signIn(page: Page, email = uniqueEmail()) {
  const t0 = Date.now() - 1000;
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await page.goto(await latestLink(email, t0));
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  return email;
}
