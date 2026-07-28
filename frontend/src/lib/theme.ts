/**
 * Theme helpers. Two themes: "light" and "dark" (Dark Ocean).
 * Dark is the default look of the app; the choice is persisted in localStorage
 * and applied by toggling the "dark" class on <html> (Tailwind darkMode: "class").
 */

export type Theme = "light" | "dark";

export const THEME_KEY = "tj_theme";

/** Read the saved theme. Anything but an explicit "light" means dark. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  const saved = window.localStorage.getItem(THEME_KEY);
  return saved === "light" ? "light" : "dark";
}

/** Apply a theme to <html> and persist the choice. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  window.localStorage.setItem(THEME_KEY, theme);
}
