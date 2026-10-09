import { expect, type Page, type Route, test } from "@playwright/test";
import { signIn, uniqueEmail } from "./helpers";

/* Models on the user's own machine run from the browser: the request goes
   from the page straight to the local server (faked here with page.route),
   never through /api/run, and a key for it never reaches our server. */

const CORS = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };

async function fakeServer(page: Page, base: string, opts: { token?: string } = {}) {
  const seenAuth: string[] = [];
  await page.route(`${base}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: CORS });
    const auth = (await req.headerValue("authorization")) ?? "";
    seenAuth.push(auth);
    if (opts.token && auth !== `Bearer ${opts.token}`) return route.fulfill({ status: 401, headers: CORS, json: { error: "Unauthorized" } });
    if (req.url().endsWith("/models")) return route.fulfill({ headers: CORS, json: { object: "list", data: [{ id: "llama3.2:latest" }, { id: "qwen3:8b" }, { id: "nomic-embed-text:latest" }] } });
    const body = JSON.parse(req.postData() ?? "{}");
    expect(body.model).toBeTruthy();
    const sse = ['{"choices":[{"delta":{"content":"Hello from "}}]}', '{"choices":[{"delta":{"content":"your own machine."}}]}', '{"choices":[],"usage":{"prompt_tokens":20,"completion_tokens":6}}']
      .map((d) => `data: ${d}\n\n`)
      .join("");
    return route.fulfill({ headers: { ...CORS, "content-type": "text/event-stream" }, body: `${sse}data: [DONE]\n\n` });
  });
  return seenAuth;
}

test("an Ollama model runs from the browser, never through our server", async ({ page }) => {
  await signIn(page, uniqueEmail("local"));
  await fakeServer(page, "http://localhost:11434");
  const appCalls: string[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/run")) appCalls.push(r.url());
  });

  await page.goto("/settings#models");
  await page.getByRole("button", { name: "Add model" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /^Ollama\b/ }).click();
  await expect(dlg.getByLabel("Server address")).toHaveValue("http://localhost:11434/v1");
  await expect(dlg.getByRole("group", { name: "Browsers that can reach this address" })).toContainText("Chrome and Edge");
  await expect(dlg.getByRole("group", { name: "Browsers that can reach this address" })).toContainText("✕ Safari");
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await expect(dlg.getByText("Connected · ", { exact: false })).toContainText("2 models");
  await dlg.getByRole("combobox", { name: "Model" }).click();
  await dlg.getByRole("option", { name: /llama3\.2:latest/ }).click();
  await expect(dlg.getByText("Runs on your own hardware, so a run costs nothing here.")).toBeVisible();
  await dlg.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByText("Added Ollama.")).toBeVisible();
  await expect(page.locator('[data-model="Ollama"]')).toContainText("Your browser · http://localhost:11434/v1");

  await page.goto("/new");
  await page.getByLabel("Your prompt").fill("You are a helpful assistant.");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.getByRole("tab", { name: "Run" }).click();
  await expect(page.getByText("Runs in this browser, straight to http://localhost:11434/v1.")).toBeVisible();
  await page.getByLabel("Test message").fill("Hi");
  await page.getByRole("button", { name: "Run once" }).click();
  await expect(page.getByText("Hello from your own machine.")).toBeVisible();
  await expect(page.locator('[class*="runstats"]')).toContainText(/Tokens 26.*Cost \$0\.0000/);
  expect(appCalls).toEqual([]);
});

test("an LM Studio token stays in the browser, and an unreachable server explains itself", async ({ page }) => {
  await signIn(page, uniqueEmail("local-key"));
  const token = "lmstudio-token-0123456789";
  const seenAuth = await fakeServer(page, "http://localhost:1234", { token });
  const leaks: string[] = [];
  page.on("request", (r) => {
    const sameOrigin = new URL(r.url()).port === new URL(page.url()).port;
    if (sameOrigin && ((r.postData() ?? "").includes(token) || JSON.stringify(r.headers()).includes(token))) leaks.push(r.url());
  });

  await page.goto("/settings#models");
  await page.getByRole("button", { name: "Add model" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("button", { name: /^LM Studio\b/ }).click();
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await expect(dlg.getByText("LM Studio refused the key. Check it in Settings.")).toBeVisible();
  await dlg.getByLabel("API key (optional)").fill(token);
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await expect(dlg.getByText("Connected · ", { exact: false })).toBeVisible();
  await dlg.getByRole("combobox", { name: "Model" }).fill("qwen3:8b");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await expect(page.getByText("Added LM Studio.")).toBeVisible();
  expect(seenAuth).toContain(`Bearer ${token}`);
  expect(await page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith("41p:local-secret:")))).toBe(true);

  await page.getByRole("button", { name: "Test LM Studio" }).click();
  await expect(page.locator('[data-model="LM Studio"]')).toContainText(/Works · \d+ ms/);

  // The server stops answering.
  await page.unroute("http://localhost:1234/**");
  await page.route("http://localhost:1234/**", (route) => route.abort("connectionrefused"));
  await page.getByRole("button", { name: "Test LM Studio" }).click();
  await expect(page.getByText("Your browser could not reach the server.", { exact: true })).toBeVisible();
  await page.getByText("How to fix it", { exact: true }).click();
  await expect(page.getByText("Enable CORS", { exact: true })).toBeVisible();
  expect(leaks).toEqual([]);
});
