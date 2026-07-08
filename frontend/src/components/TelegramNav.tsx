"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BASE_PATH } from "@/lib/api";

declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

/**
 * ادغام با مینی‌اپِ تلگرام + هابِ algohub: دکمهٔ بازگشتِ بومیِ تلگرام روی هر
 * صفحه‌ای غیر از خانهٔ ژورنال، و بازگردانیِ آخرین مسیر با همان کلیدِ
 * localStorage ("cs_route") که اسکریپتِ همتایش در پروژهٔ پورتفولیو
 * (app/static/js/telegram.js) استفاده می‌کند -- چون هر دو اپ زیرِ یک دامنه‌اند،
 * وقتی کاربر داخلِ تلگرام از این اپ به آن اپ رفت و مینی‌اپ دوباره باز شد،
 * دقیقاً همان‌جا که بود ادامه می‌دهد، نه از اول.
 */
export function TelegramNav() {
  const pathname = usePathname();
  const router = useRouter();

  // یک‌بار در بوت: ready/expand + بازگردانیِ مسیر در صورتِ بازِ مجددِ مینی‌اپ.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
    } catch {}
    try {
      tg.expand();
    } catch {}
    document.documentElement.classList.add("in-telegram");

    try {
      if (pathname === "/" && !document.referrer) {
        const last = localStorage.getItem("cs_route");
        if (last && last !== "/" && last !== BASE_PATH && last.charAt(0) === "/") {
          window.location.replace(last);
        }
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // روی هر تغییرِ مسیر: ذخیرهٔ آخرین مسیر + نمایش/مخفی‌کردنِ دکمهٔ بازگشت.
  useEffect(() => {
    const isHome = pathname === "/";
    try {
      if (!isHome) localStorage.setItem("cs_route", `${BASE_PATH}${pathname}`);
    } catch {}

    const tg = window.Telegram?.WebApp;
    const bb = tg?.BackButton;
    if (!bb) return;

    if (isHome) {
      bb.hide();
      return;
    }
    bb.show();
    const onClick = () => {
      if (window.history.length > 1) router.back();
      else router.push("/");
    };
    bb.onClick(onClick);
    return () => {
      try {
        bb.offClick(onClick);
      } catch {}
    };
  }, [pathname, router]);

  return null;
}
