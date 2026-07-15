"use client";

/** Small reusable React hooks. */
import { useEffect, useRef, useState } from "react";

/** Returns a debounced copy of `value` that updates after `delay` ms. */
export function useDebounced<T>(value: T, delay = 600): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/** Calls `fn` on an interval (ms). Pass enabled=false to pause. */
export function useInterval(fn: () => void, ms: number, enabled = true) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => saved.current(), ms);
    return () => clearInterval(id);
  }, [ms, enabled]);
}

/**
 * Keep public team data fresh:
 *  - runs `fn` immediately on mount
 *  - re-runs every `ms` while the browser tab is visible
 *  - refreshes immediately when the tab becomes visible again
 * Failures are swallowed so the last good snapshot stays on screen.
 */
export function useLiveRefresh(
  fn: () => void | Promise<void>,
  ms: number,
  enabled = true,
) {
  const saved = useRef(fn);
  useEffect(() => {
    saved.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const run = async () => {
      try {
        await saved.current();
      } catch {
        // Keep last successful data; transient network blips shouldn't blank the UI.
      }
    };

    const schedule = () => {
      if (cancelled) return;
      timer = setTimeout(async () => {
        if (typeof document === "undefined" || document.visibilityState === "visible") {
          await run();
        }
        schedule();
      }, ms);
    };

    void run();
    schedule();

    const onVis = () => {
      if (document.visibilityState === "visible") void run();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled]);
}
