/**
 * Theme helpers — five selectable themes based on the Crypto Smart palette.
 *
 *   light  — روشن          #F3F6F9  (Very Light Background)
 *   soft   — روشن ملایم    #BFC7CE  (Base Gray)
 *   dark   — دارک           #2B3136  (Gray 900)
 *   ocean  — دارک اوشن     #162F55  (Dark 900 — Deep Background)
 *   blue   — بلو دارک       #2D63B0  (Hover / Active State)
 *
 * The choice is persisted in localStorage and applied to <html> as:
 *   - `data-theme="<id>"`  → selects the CSS variable block in globals.css
 *   - the `dark` class      → kept in sync for Tailwind `dark:` utilities
 *     (added for every dark theme, removed for the two light ones).
 */

export type Theme = "light" | "soft" | "dark" | "ocean" | "blue";

export const THEME_KEY = "tj_theme";

/** Default look of the app (unchanged: Dark Ocean). */
export const DEFAULT_THEME: Theme = "ocean";

export interface ThemeOption {
  id: Theme;
  /** Persian label shown in the picker. */
  label: string;
  /** Base background colour of the theme (used for the swatch). */
  swatch: string;
  /** Text colour on top of the swatch. */
  swatchOn: string;
  /** True when text has to be light on this theme. */
  isDark: boolean;
}

export const THEMES: ThemeOption[] = [
  { id: "light", label: "روشن", swatch: "#F3F6F9", swatchOn: "#2B3136", isDark: false },
  { id: "soft", label: "روشن ملایم", swatch: "#BFC7CE", swatchOn: "#1F262B", isDark: false },
  { id: "dark", label: "دارک", swatch: "#2B3136", swatchOn: "#F3F6F9", isDark: true },
  { id: "ocean", label: "دارک اوشن", swatch: "#162F55", swatchOn: "#F3F6F9", isDark: true },
  { id: "blue", label: "بلو دارک", swatch: "#2D63B0", swatchOn: "#F3F6F9", isDark: true },
];

const BY_ID: Record<string, ThemeOption> = THEMES.reduce(
  (acc, t) => ({ ...acc, [t.id]: t }),
  {} as Record<string, ThemeOption>
);

/** True when the given theme needs light text. */
export function isDarkTheme(theme: Theme): boolean {
  return BY_ID[theme]?.isDark ?? true;
}

export function themeOption(theme: Theme): ThemeOption {
  return BY_ID[theme] ?? BY_ID[DEFAULT_THEME];
}

/**
 * Normalise anything coming from localStorage.
 * Legacy values: "dark" used to mean Dark Ocean — it is now its own theme, so
 * the old stored value maps to `ocean` to keep existing users' look identical.
 */
export function normalizeTheme(value: string | null | undefined): Theme {
  if (!value) return DEFAULT_THEME;
  if (value === "dark") return "ocean"; // legacy alias
  return (BY_ID[value]?.id as Theme) ?? DEFAULT_THEME;
}

/** Read the saved theme. */
export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    return normalizeTheme(window.localStorage.getItem(THEME_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

/** Apply a theme to <html> and persist the choice. */
export function applyTheme(theme: Theme) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
  if (isDarkTheme(theme)) root.classList.add("dark");
  else root.classList.remove("dark");
  try {
    window.localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage disabled — the theme still applies for this session */
  }
}
