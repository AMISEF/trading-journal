"use client";

/**
 * نصب اپ ALGO HUB روی صفحهٔ اصلی گوشی — نسخهٔ داخل ژورنال.
 *
 * اپ ALGO HUB شامل مدیریت سرمایه و ژورنال تریدینگ است؛ سرویس‌وورکر روی ریشهٔ
 * دامنه («/») ثبت می‌شود، پس هر دو بخش زیر یک اپ قرار می‌گیرند.
 */
import { useEffect, useState } from "react";
import { BASE_PATH } from "@/lib/api";

const DISMISS_KEY = "ah-pwa-dismissed-at";
const DISMISS_DAYS = 7;

type Mode = "prompt" | "ios";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as any).standalone === true
  );
}

function inTelegram(): boolean {
  const tg = (window as any).Telegram?.WebApp;
  return !!(tg && tg.initData);
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function dismissedRecently(): boolean {
  try {
    const at = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    return at > 0 && Date.now() - at < DISMISS_DAYS * 86400000;
  } catch {
    return false;
  }
}

export function PwaInstall() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [deferred, setDeferred] = useState<any>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (isStandalone() || inTelegram() || dismissedRecently()) return;

    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferred(e);
      setTimeout(() => setMode("prompt"), 2500);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    let t: any = null;
    if (isIos()) t = setTimeout(() => setMode((m) => m ?? "ios"), 3000);

    const onInstalled = () => close();
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  function close() {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
    setMode(null);
  }

  async function install() {
    if (!deferred) return close();
    deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {}
    setDeferred(null);
    close();
  }

  if (!mode) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-[calc(78px+env(safe-area-inset-bottom))] left-3 right-3 z-[95] flex items-center gap-3 rounded-2xl p-4 md:bottom-5 md:left-5 md:right-auto md:max-w-sm"
      style={{
        background: "var(--surface)",
        color: "var(--text)",
        border: "1px solid var(--border)",
        boxShadow: "var(--glass-shadow)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`${BASE_PATH}/app-icon`}
        alt="ALGO HUB"
        className="h-12 w-12 shrink-0 rounded-2xl object-contain p-1"
        style={{ background: "var(--surface-2)" }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-extrabold">اپ ALGO HUB را روی صفحهٔ اصلی گوشی‌تان نصب کنید</div>
        <div className="mt-0.5 text-xs leading-7" style={{ color: "var(--muted)" }}>
          {mode === "ios"
            ? "در سافاری، دکمهٔ «اشتراک‌گذاری» را بزنید و «افزودن به صفحهٔ اصلی» را انتخاب کنید."
            : "ژورنال تریدینگ و مدیریت سرمایه در یک اپ — سریع‌تر و همیشه دم‌دست."}
        </div>
      </div>
      {mode === "prompt" && (
        <button
          type="button"
          onClick={install}
          className="shrink-0 rounded-xl px-4 py-2 text-xs font-extrabold"
          style={{ background: "linear-gradient(135deg,#4ED9CC,#19C3B3 45%,#128F84)", color: "#04201d" }}
        >
          نصب اپ
        </button>
      )}
      <button
        type="button"
        onClick={close}
        aria-label="بستن"
        className="shrink-0 rounded-lg px-2 py-1 text-base opacity-60"
        style={{ color: "var(--muted)" }}
      >
        ✕
      </button>
    </div>
  );
}

export default PwaInstall;
