/**
 * Theme helpers. Two themes: "light" and "dark" (Dark Ocean).
 * The choice is persisted in localStorage and applied by toggling the
 * "dark" class on <html> (Tailwind darkMode: "class").
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "tj_theme";

/** Read the saved theme, falling back to "light". */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "dark" ? "dark" : "light";
}

/** Apply a theme to <html> and persist the choice. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  window.localStorage.setItem(THEME_KEY, theme);
}
