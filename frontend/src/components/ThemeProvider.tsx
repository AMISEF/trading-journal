"use client";

/**
 * ThemeProvider: exposes the current theme + a toggle via React context.
 * Dark is the default; the saved choice is read on mount and <html class="dark">
 * is kept in sync.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { applyTheme, getStoredTheme, Theme } from "@/lib/theme";

interface ThemeCtx {
  theme: Theme;
  toggleTheme: () => void;
}

const Ctx = createContext<ThemeCtx>({ theme: "dark", toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Sync from localStorage on mount (the inline head script already applied
  // the class; here we just mirror it into React state).
  useEffect(() => {
    setTheme(getStoredTheme());
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
  };

  return <Ctx.Provider value={{ theme, toggleTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
