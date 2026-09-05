import { afterEach, describe, expect, it, vi } from "vitest";
import { themeInitScript } from "./theme-script.js";

const COOKIE_NAME = "41p-theme";

function run() {
  new Function(themeInitScript(COOKIE_NAME))();
}

function clearCookie() {
  document.cookie = `${COOKIE_NAME}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
}

afterEach(() => {
  clearCookie();
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});

describe("themeInitScript", () => {
  it("sets data-theme from an existing cookie, ignoring system preference", () => {
    document.cookie = `${COOKIE_NAME}=dark`;
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to prefers-color-scheme when there is no cookie", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("falls back to light when there is no cookie and no dark system preference", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: false } as MediaQueryList);
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("ignores a garbage cookie value and falls back to system preference", () => {
    document.cookie = `${COOKIE_NAME}=purple`;
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    run();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("never throws even if matchMedia is unavailable", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(() => {
      throw new Error("no matchMedia in this environment");
    });
    expect(run).not.toThrow();
  });
});
