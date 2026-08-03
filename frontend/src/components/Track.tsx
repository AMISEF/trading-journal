"use client";

/**
 * رهگیری بازدید برای اندازه‌گیری قیف محصول.
 *
 * فقط یک شناسهٔ تصادفی در localStorage نگه داشته می‌شود (بدون هیچ
 * دادهٔ شخصی) تا «بازدیدکنندهٔ یکتا» قابل شمارش باشد. صفحات
 * خصوصی (پنل مدیریت) رهگیری نمی‌شوند.
 *
 * توجه: پایهٔ نشانی API خودش به /api ختم می‌شود، پس مسیر اینجا بدون
 * پیشوند /api نوشته می‌شود.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import http from "@/lib/api";

const KEY = "ah_vid";
const SKIP = ["/admin"];

function visitorId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

export function Track() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || SKIP.some((p) => pathname.startsWith(p))) return;
    const params = new URLSearchParams(window.location.search);
    http
      .post("/analytics/track", {
        kind: "view",
        vid: visitorId(),
        path: pathname,
        referrer: document.referrer || "",
        source: params.get("utm_source") || params.get("src") || "",
        campaign: params.get("utm_campaign") || "",
      })
      .catch(() => {});
  }, [pathname]);

  return null;
}

export default Track;
