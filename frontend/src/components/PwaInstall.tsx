"use client";

/**
 * اپ ALGO HUB — نسخهٔ داخل ژورنال.
 *
 * ۱) اسپلشِ شروع: وقتی اپ نصب‌شده باز می‌شود، لوگوی ALGO HUB نمایش داده می‌شود.
 * ۲) نوار توصیهٔ نصب روی صفحهٔ اصلی گوشی (با راهنمای جداگانه برای آیفون).
 *
 * تصاویر را سرویسِ هاب روی ریشهٔ دامنه سرو می‌کند:
 *   /app-icon?size=N    آیکن اپ (پس‌زمینهٔ آبی)
 *   /app-splash?size=N  لوگوی شفافِ صفحهٔ شروع
 */
import { useEffect, useState } from "react";

const DISMISS_KEY = "ah-pwa-dismissed-at";
const SPLASH_KEY = "ah-splash-shown";
const DISMISS_DAYS = 7;

const APP_ICON = "/app-icon?size=192";
const APP_SPLASH = "/app-splash?size=512";

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
  const [splash, setSplash] = useState(false);
  const [splashOut, setSplashOut] = useState(false);

  // ثبت سرویس‌وورکر (روی ریشهٔ دامنه سرو می‌شود).
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);

  // اسپلشِ شروع — فقط در حالت اپ و یک‌بار در هر اجرا.
  useEffect(() => {
    if (!isStandalone() || inTelegram()) return;
    try {
      if (sessionStorage.getItem(SPLASH_KEY)) return;
      sessionStorage.setItem(SPLASH_KEY, "1");
    } catch {}

    setSplash(true);
    const fade = setTimeout(() => setSplashOut(true), 1300);
    const gone = setTimeout(() => setSplash(false), 1800);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
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

  return (
    <>
      {splash && (
        <div
          className="fixed inset-0 z-[100000] flex flex-col items-center justify-center gap-4 transition-opacity duration-500"
          style={{ background: "#0A1622", opacity: splashOut ? 0 : 1 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APP_SPLASH} alt="ALGO HUB" className="w-[min(46vw,190px)]" />
          <div className="text-xs tracking-[0.22em] text-[#cfe3f5] opacity-70">ALGO HUB</div>
        </div>
      )}

      {mode && (
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
            src={APP_ICON}
            alt="ALGO HUB"
            className="h-12 w-12 shrink-0 rounded-2xl object-cover"
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
      )}
    </>
  );
}

export default PwaInstall;
