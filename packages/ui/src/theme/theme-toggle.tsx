"use client";

import { useEffect, useState } from "react";
import { Button } from "../primitives/button";
import { THEME_COOKIE_NAME, isThemeValue, type ThemeValue } from "./constants";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Reads/writes `data-theme` on `<html>` directly — no re-render of the rest of the tree needed. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeValue | null>(null);

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(isThemeValue(current) ? current : "light");
  }, []);

  function toggle() {
    const next: ThemeValue = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    document.cookie = `${THEME_COOKIE_NAME}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    setTheme(next);
  }

  return (
    <Button variant="ghost" size="sm" onClick={toggle} aria-pressed={theme === "dark"}>
      Theme
    </Button>
  );
}
