"use client";

/**
 * Theme picker: a sun/moon button that opens a small menu with the five
 * available themes (روشن / روشن ملایم / دارک / دارک اوشن / بلو دارک).
 * Each row shows a colour swatch so the choice is obvious at a glance.
 */
import { useEffect, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";
import { THEMES, type Theme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, isDark, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = (id: Theme) => {
    setTheme(id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        title="انتخاب تم سایت"
        aria-label="انتخاب تم سایت"
        aria-haspopup="menu"
        aria-expanded={open}
        className="grid h-10 w-10 place-items-center rounded-full border border-border bg-surface-2 text-text hover:text-primary"
      >
        {isDark ? (
          // Moon icon — a dark theme is active
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
          </svg>
        ) : (
          // Sun icon — a light theme is active
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
          </svg>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute end-0 top-12 z-50 w-52 overflow-hidden rounded-2xl border border-border bg-surface p-1.5 shadow-2xl"
        >
          <div className="px-2 pb-1.5 pt-1 text-[11px] font-bold text-muted">
            تم سایت
          </div>
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                role="menuitemradio"
                aria-checked={active}
                onClick={() => pick(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition ${
                  active
                    ? "bg-primary-soft font-bold text-primary"
                    : "text-text hover:bg-surface-2"
                }`}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-border"
                  style={{ background: t.swatch, color: t.swatchOn }}
                >
                  {t.isDark ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                    </svg>
                  ) : (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
                      <circle cx="12" cy="12" r="4.5" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 text-start">{t.label}</span>
                {active && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
