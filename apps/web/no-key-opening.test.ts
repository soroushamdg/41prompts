import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **`apps/web` must not contain a call that can open a sealed provider key.**
 *
 * This is threat-model row `043a` expressed as a test rather than as a convention. The deployment
 * gives `web` only `KEY_ENCRYPTION_PUBLIC_KEY`, so an opening call here would not merely be a
 * design mistake — it would be a runtime error in production and a working call in development,
 * which is the worst possible ordering for discovering it.
 *
 * It greps rather than inspecting types because the property being asserted is about **what is
 * written**, not about what typechecks: `openStoredProviderKey` is exported from `@41prompts/db`
 * and is perfectly well typed here. The rule is that nobody calls it.
 *
 * `putProviderKey` is deliberately **not** on the list: sealing is the web's job and needs only the
 * public half.
 */

const FORBIDDEN = ["openStoredProviderKey", "openEnabledProviderKey", "openProviderKey", "masterKeyFromSecret"];

const webRoot = dirname(fileURLToPath(import.meta.url));
const SKIP = new Set(["node_modules", ".next", "dist", ".turbo"]);

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (SKIP.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx|mts|mjs)$/.test(entry)) found.push(path);
  }
  return found;
}

describe("apps/web cannot open a provider key", () => {
  it("calls none of the functions that produce a plaintext key", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(webRoot)) {
      // This file names all four, and is the one place they may appear.
      if (path === fileURLToPath(import.meta.url)) continue;
      const source = readFileSync(path, "utf-8");
      for (const name of FORBIDDEN) {
        if (source.includes(name)) offenders.push(`${path.slice(webRoot.length + 1)} → ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /** And the grep is real: it finds a call when there is one. */
  it("would catch one", () => {
    const pretend = "const key = await openStoredProviderKey(db, owner, 'openai');";
    expect(FORBIDDEN.some((name) => pretend.includes(name))).toBe(true);
  });
});
