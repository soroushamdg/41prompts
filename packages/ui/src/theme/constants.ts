export const THEME_COOKIE_NAME = "41p-theme";

export type ThemeValue = "light" | "dark";

export function isThemeValue(value: string | null | undefined): value is ThemeValue {
  return value === "light" || value === "dark";
}
