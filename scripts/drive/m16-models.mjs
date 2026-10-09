/* Drive: Settings › Models end to end (M06, M07). Against a built app started
   with E2E_MODE=1 (hosted providers are faked on the server). A real local
   OpenAI-compatible server stands in for Ollama, so the browser-run path is
   exercised for real: CORS, streaming, and an unreachable server.
   Screenshots at 1440 and 390 wide. */
import { createServer } from "node:http";
import { APP, assertStyled, check, launch, signInViaOutbox } from "./lib.mjs";

const PORT = 11999;
let local = 0;
const fake = createServer((req, res) => {
  local += 1;
  const cors = { "access-control-allow-origin": APP, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "GET, POST, OPTIONS" };
  if (req.method === "OPTIONS") return res.writeHead(204, cors).end();
  if (req.url.endsWith("/models")) return res.writeHead(200, { ...cors, "content-type": "application/json" }).end(JSON.stringify({ object: "list", data: [{ id: "llama3.2:latest" }, { id: "qwen3:8b" }] }));
  res.writeHead(200, { ...cors, "content-type": "text/event-stream" });
  const words = "Hello from a model on this machine. Nothing went through the 41prompts server.".split(" ");
  let i = 0;
  const t = setInterval(() => {
    if (i < words.length) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: (i ? " " : "") + words[i] } }] })}\n\n`);
    else {
      res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 31, completion_tokens: words.length } })}\n\ndata: [DONE]\n\n`);
      res.end();
      clearInterval(t);
    }
    i += 1;
  }, 60);
});
await new Promise((r) => fake.listen(PORT, "127.0.0.1", r));

const { browser, context, page, shot, errors } = await launch("m16-models");
try {
  const runs = [];
  page.on("request", (r) => r.url().includes("/api/run") && runs.push(r.url()));
  await signInViaOutbox(page, `models-${Date.now()}@example.test`);
  await page.getByText("No models yet. Add one to run prompts on your own account.").waitFor();
  check(true, "library says there are no models yet");
  await page.goto(`${APP}/settings#models`);
  await assertStyled(page);
  await shot("empty");

  // Provider grid and search.
  await page.getByRole("button", { name: "Add model" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("heading", { name: "Add a model" }).waitFor();
  await page.waitForTimeout(400);
  await shot("providers");
  await dlg.getByLabel("Search providers").fill("gro");
  check((await dlg.locator("[data-provider]").count()) >= 1 && (await dlg.locator('[data-provider="groq"]').count()) === 1, "search narrows the providers");
  await dlg.getByLabel("Search providers").fill("");

  // Hosted: a refused key, then a good one, a model from the live list, and its price.
  await dlg.getByRole("button", { name: /^OpenAI\b/ }).click();
  await dlg.getByLabel("Label").fill("Work GPT");
  await dlg.getByLabel("API key").fill("sk-bad-key-for-drive");
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await dlg.getByText("OpenAI refused that key. Check it and try again.").waitFor();
  check(true, "a refused key is explained");
  await dlg.getByLabel("API key").fill("sk-proj-good-key-3f9a");
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await dlg.getByText(/Connected · 212 ms · 3 models/).waitFor();
  await dlg.getByRole("combobox", { name: "Model" }).click();
  await page.waitForTimeout(300);
  await shot("model-list");
  await dlg.getByRole("option", { name: /gpt-6\.1-sol/ }).click();
  check((await dlg.getByLabel("Input").inputValue()) === "2", "the price fills in from the list");
  await shot("connect-filled");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await page.getByText("Added Work GPT.").waitFor();
  check(!(await page.content()).includes("good-key"), "the key never comes back to the page");

  // Duplicate keeps the key.
  await page.getByRole("button", { name: "Duplicate Work GPT" }).click();
  await dlg.getByText("Copied from Work GPT · ends 3f9a").waitFor();
  await dlg.getByLabel("Label").fill("Cheap GPT");
  await dlg.getByRole("combobox", { name: "Model" }).fill("gpt-6-luna");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await page.getByText("Added Cheap GPT.").waitFor();
  check(true, "duplicate saves without typing the key again");

  // A model on this machine, run from the browser.
  await page.getByRole("button", { name: "Add model" }).first().click();
  await dlg.getByRole("button", { name: /^Ollama\b/ }).click();
  await dlg.getByLabel("Server address").fill(`http://localhost:${PORT}/v1`);
  await dlg.getByRole("group", { name: "Browsers that can reach this address" }).waitFor();
  await dlg.getByRole("button", { name: "Connect and load models" }).click();
  await dlg.getByText(/Connected · \d+ ms · 2 models/).waitFor();
  check(local >= 1, "the browser reached the local server directly");
  await dlg.getByRole("combobox", { name: "Model" }).click();
  await dlg.getByRole("option", { name: /llama3\.2:latest/ }).click();
  await shot("ollama");
  await dlg.getByRole("button", { name: "Save model" }).click();
  await page.getByText("Added Ollama.").waitFor();

  // Custom on the LAN: suggested to run in the browser; says which browsers can reach it.
  await page.getByRole("button", { name: "Add model" }).first().click();
  await dlg.getByRole("button", { name: /^Custom\b/ }).click();
  await dlg.getByLabel("Base URL").fill("http://192.168.1.50:8000/v1");
  check((await dlg.getByRole("button", { name: "In my browser" }).getAttribute("aria-pressed")) === "true", "a LAN address runs in the browser");
  const works = await dlg.getByRole("group", { name: "Browsers that can reach this address" }).textContent();
  check(/✓ Chrome and Edge/.test(works) && /✕ Firefox/.test(works) && /✕ Safari/.test(works), `works-in line (${works.replace(/\s+/g, " ").trim()})`);
  await shot("custom-lan");
  await dlg.getByRole("button", { name: "Cancel" }).click();

  await page.waitForTimeout(300);
  await shot("list");

  // Run on the local model.
  await page.goto(`${APP}/new`);
  await page.getByLabel("Your prompt").fill("You are a helpful assistant. Keep replies short.");
  await page.getByLabel("Name").fill("local-run");
  await page.getByRole("button", { name: "Create prompt" }).click();
  await page.waitForURL(/\/p\/local-run$/);
  await page.getByRole("tab", { name: "Run" }).click();
  await page.getByLabel(/^Model/).selectOption({ label: "Ollama · llama3.2:latest" });
  await page.getByText(`Runs in this browser, straight to http://localhost:${PORT}/v1.`).waitFor();
  await page.getByLabel("Test message").fill("Hi");
  await page.getByRole("button", { name: "Run once" }).click();
  await page.getByText("Nothing went through the 41prompts server.", { exact: false }).waitFor();
  await page.getByRole("button", { name: "Run again" }).waitFor();
  const stats = (await page.locator('[class*="runstats"]').textContent()).replace(/\s+/g, " ");
  check(/Tokens 4\d/.test(stats) && /\$0\.0000/.test(stats), `local run stats (${stats.trim()})`);
  check(runs.length === 0, "the local run never called /api/run");
  await shot("local-run");

  // Phone width.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/settings#models`);
  await page.waitForTimeout(500);
  await shot("phone-list");
  await page.getByRole("button", { name: "Add model" }).first().click();
  await page.waitForTimeout(400);
  await shot("phone-providers");
  await dlg.getByRole("button", { name: /^OpenRouter\b/ }).click();
  await page.waitForTimeout(300);
  await shot("phone-connect");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(!overflow, "no sideways scroll at 390");
  await dlg.getByRole("button", { name: "Cancel" }).click();
  await page.setViewportSize({ width: 1440, height: 900 });

  // The local server goes away.
  await new Promise((r) => fake.close(r));
  fake.closeAllConnections?.();
  await page.goto(`${APP}/settings#models`);
  await page.getByRole("button", { name: "Test Ollama" }).click();
  await page.getByText("Your browser could not reach the server.", { exact: true }).waitFor();
  await page.getByText("How to fix it", { exact: true }).click();
  await page.getByText(/OLLAMA_ORIGINS/).first().waitFor();
  await shot("unreachable");
  check(true, "an unreachable local server explains how to fix it");

  const ours = errors.filter((e) => !/localhost:11999|ERR_CONNECTION_REFUSED|Failed to load resource/.test(e));
  check(ours.length === 0, `no console errors (${ours.join(" | ")})`);
  console.log("DRIVE PASS m16-models");
} catch (e) {
  await shot("failure").catch(() => {});
  console.error("DRIVE FAIL m16-models:", e.message);
  process.exitCode = 1;
} finally {
  fake.close();
  await browser.close();
  void context;
}
