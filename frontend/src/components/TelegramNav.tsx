"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BASE_PATH } from "@/lib/api";

declare global {
  interface Window {
    Telegram?: { WebApp?: any };
  }
}

/**
 * ادغام با مینی‌اپِ تلگرام + هابِ algohub.
 *
 * مشکلِ اصلی: لایهٔ بومیِ اپِ تلگرام، تپ روی <a href>هایِ واقعی را قبل از رسیدن
 * به رویدادهای جاوااسکریپتِ صفحه می‌گیرد و خودش یک بارگذاریِ کامل می‌زند که در
 * وب‌ویو با «Oops... Failed to load» شکست می‌خورد. برای همین (مثلِ همتای
 * پورتفولیو در app/static/js/telegram.js) داخلِ تلگرام:
 *   - href همهٔ لینک‌های هم‌مبدأ برداشته می‌شود (در data-cs-href نگه می‌ماند) تا
 *     چیزی برای گرفتنِ لایهٔ بومی نمانَد. Next لینک‌ها را بازرندر می‌کند، پس با
 *     MutationObserver دوباره خنثی می‌کنیم.
 *   - کلیک‌ها را خودمان می‌گیریم: صفحاتِ داخلِ ژورنال با router.push (نرم، بدونِ
 *     بارگذاری) و لینک‌های بین‌اپی (پورتفولیو) با location.assign (بارگذاریِ
 *     کاملِ JS-driven که درونِ همان وب‌ویو می‌مانَد و شکست نمی‌خورد).
 *
 * خارج از تلگرام هیچ‌کدامِ این‌ها فعال نمی‌شود؛ لینک‌ها عادی کار می‌کنند.
 */
export function TelegramNav() {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // یک‌بار در بوت: ready/expand + خنثی‌سازیِ لینک‌ها + گرفتنِ کلیک‌ها.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try { tg.ready(); } catch {}
    try { tg.expand(); } catch {}
    document.documentElement.classList.add("in-telegram");

    // بازگردانیِ آخرین مسیر در صورتِ بازِ مجددِ مینی‌اپ (کلیدِ مشترک با پورتفولیو).
    try {
      if (pathname === "/" && !document.referrer) {
        const last = localStorage.getItem("cs_route");
        if (last && last !== "/" && last !== BASE_PATH && last.charAt(0) === "/") {
          window.location.replace(last);
          return;
        }
      }
    } catch {}

    const sameOrigin = (u: URL) => u.origin === window.location.origin;
    const isJournalInternal = (u: URL) => {
      if (!sameOrigin(u)) return false;
      if (!BASE_PATH) return true; // حالتِ standalone: همه‌چیز همین اپ است
      return u.pathname === BASE_PATH || u.pathname.startsWith(BASE_PATH + "/");
    };
    const stripBase = (p: string) => {
      if (BASE_PATH && (p === BASE_PATH || p.startsWith(BASE_PATH + "/"))) {
        return p.slice(BASE_PATH.length) || "/";
      }
      return p;
    };
    const eligibleHref = (href: string | null) => {
      if (!href) return false;
      if (href.charAt(0) === "#") return false;
      if (/^(javascript|mailto|tel):/i.test(href)) return false;
      try { return sameOrigin(new URL(href, window.location.href)); }
      catch { return false; }
    };

    const neutralizeAnchor = (a: HTMLAnchorElement) => {
      if (a.dataset.noSpa !== undefined) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href");
      if (eligibleHref(href)) {
        a.dataset.csHref = href as string;
        a.removeAttribute("href");
        a.style.cursor = "pointer";
      }
    };
    const neutralizeTree = (root: ParentNode) => {
      if ((root as Element).querySelectorAll) {
        (root as Element).querySelectorAll("a[href]").forEach((el) =>
          neutralizeAnchor(el as HTMLAnchorElement)
        );
      }
      if (root instanceof HTMLAnchorElement) neutralizeAnchor(root);
    };
    neutralizeTree(document);

    const observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "attributes") {
          if (m.target instanceof HTMLAnchorElement) neutralizeAnchor(m.target);
        } else {
          m.addedNodes.forEach((n) => {
            if (n instanceof Element) neutralizeTree(n);
          });
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["href"],
    });

    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as Element | null;
      const a = target && target.closest ? (target.closest("a") as HTMLAnchorElement | null) : null;
      if (!a) return;
      if (a.dataset.noSpa !== undefined) return;
      if (a.target && a.target !== "" && a.target !== "_self") return;
      const raw = a.dataset.csHref || a.getAttribute("href");
      if (!eligibleHref(raw)) return;
      let url: URL;
      try { url = new URL(raw as string, window.location.href); } catch { return; }
      e.preventDefault();
      e.stopPropagation();
      if (url.href === window.location.href) return;
      if (isJournalInternal(url)) {
        routerRef.current.push(stripBase(url.pathname) + url.search + url.hash);
      } else {
        window.location.assign(url.href);
      }
    };
    document.addEventListener("click", onClick, true);

    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
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
    const onBack = () => {
      if (window.history.length > 1) router.back();
      else router.push("/");
    };
    bb.onClick(onBack);
    return () => {
      try {
        bb.offClick(onBack);
      } catch {}
    };
  }, [pathname, router]);

  return null;
}
