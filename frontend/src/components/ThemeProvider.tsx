"use client";

/**
 * ThemeProvider: exposes the current theme + a setter via React context.
 * Dark Ocean is the default; the saved choice is read on mount and
 * <html data-theme="…" class="dark?"> is kept in sync.
 */
import { createContext, useContext, useEffect, useState } from "react";
import {
  applyTheme,
  DEFAULT_THEME,
  getStoredTheme,
  isDarkTheme,
  Theme,
} from "@/lib/theme";

interface ThemeCtx {
  theme: Theme;
  /** True when the active theme needs light text. */
  isDark: boolean;
  setTheme: (theme: Theme) => void;
  /** Kept for backwards compatibility: flips between light and Dark Ocean. */
  toggleTheme: () => void;
}

const Ctx = createContext<ThemeCtx>({
  theme: DEFAULT_THEME,
  isDark: true,
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // Sync from localStorage on mount (the inline head script already applied
  // the attribute/class; here we just mirror it into React state).
  useEffect(() => {
    setThemeState(getStoredTheme());
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
  };

  const toggleTheme = () => setTheme(isDarkTheme(theme) ? "light" : "ocean");

  return (
    <Ctx.Provider
      value={{ theme, isDark: isDarkTheme(theme), setTheme, toggleTheme }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  return useContext(Ctx);
}
