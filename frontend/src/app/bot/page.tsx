"use client";

/**
 * صفحهٔ «برایند ربات» (/journal/bot).
 * برایندِ زندهٔ معاملاتِ ربات الگو اسمارت (داشبورد + ژورنال + تحلیل هوش مصنوعی) که
 * پیش‌تر داخلِ صفحهٔ اصلیِ معرفیِ ژورنال بود و حالا منوی مستقلِ خودش را دارد.
 * فرمِ صفحه دقیقاً همان شلِ سایتِ الگو هاب است (همان پس‌زمینه/هدر/فوتر و نوار منوی هاب).
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getToken, BASE_PATH } from "@/lib/api";
import { HubNav } from "@/components/HubNav";
import { TeamLiveSection } from "@/components/TeamLiveSection";
import { LandingFooter } from "@/components/LandingFooter";

const C = {
  deep: "#0b1e3d",
  brand800: "#1B3F70",
  brand500: "#2D63B0",
  accentDark: "#128F84",
  accent: "#19C3B3",
  accentLight: "#4ED9CC",
};

export default function BotPage() {
  const [scrolled, setScrolled] = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden pb-20 text-white md:pb-0"
      style={{
        background: `radial-gradient(1200px 700px at 80% -10%, ${C.brand800} 0%, transparent 55%), radial-gradient(1000px 600px at 0% 10%, ${C.accentDark}33 0%, transparent 50%), linear-gradient(180deg, ${C.deep} 0%, #081733 60%, ${C.deep} 100%)`,
      }}
    >
      {/* Ambient animated glow */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-40 -top-20 h-[520px] w-[520px] rounded-full blur-[130px]" style={{ background: `${C.accent}22` }} />
        <div className="animate-blob-slow absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full blur-[130px]" style={{ background: `${C.brand500}2e` }} />
        <div className="animate-blob absolute bottom-0 right-1/3 h-[440px] w-[440px] rounded-full blur-[130px]" style={{ background: `${C.accentLight}1f` }} />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(70% 60% at 50% 0%, black, transparent)",
          }}
        />
      </div>

      {/* ── Header ── */}
      <header
        className="fixed inset-x-0 top-0 z-40 transition-all duration-300"
        style={{
          background: scrolled ? "rgba(11,30,61,0.72)" : "transparent",
          backdropFilter: scrolled ? "blur(18px) saturate(160%)" : "none",
          WebkitBackdropFilter: scrolled ? "blur(18px) saturate(160%)" : "none",
          borderBottom: scrolled ? "1px solid rgba(255,255,255,0.08)" : "1px solid transparent",
        }}
      >
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5 md:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src={`${BASE_PATH}/logo-icon.png`} alt="Algo Hub" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">
              ALGO <span style={{ color: C.accent }}>HUB</span>
            </span>
          </Link>

          <div className="flex items-center gap-2.5">
            {loggedIn ? (
              <Link
                href="/dashboard"
                className="rounded-xl px-4 py-2 text-sm font-bold text-[#0b1e3d] transition-all hover:-translate-y-0.5"
                style={{ background: `linear-gradient(120deg, ${C.accentLight}, ${C.accent})`, boxShadow: `0 10px 26px -10px ${C.accent}` }}
              >
                داشبورد من
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white/90 transition-all hover:border-white/40 hover:bg-white/5">
                  ورود
                </Link>
                <Link
                  href="/register"
                  className="rounded-xl px-4 py-2 text-sm font-bold text-[#0b1e3d] transition-all hover:-translate-y-0.5"
                  style={{ background: `linear-gradient(120deg, ${C.accentLight}, ${C.accent})`, boxShadow: `0 10px 26px -10px ${C.accent}` }}
                >
                  ثبت‌نام
                </Link>
              </>
            )}
          </div>
        </nav>
      </header>

      {/* فاصله از هدرِ ثابت */}
      <div className="pt-24 md:pt-28" />

      {/* ── برایند معاملات ربات الگو اسمارت ── */}
      <TeamLiveSection showAiTab />

      {/* ── Footer ── */}
      <LandingFooter />
      <HubNav active="bot" />
    </div>
  );
}
