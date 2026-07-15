"use client";

/**
 * Standalone public site for pnl.cryptosmart.site — live Algo Smart bot PnL.
 * Reuses TeamLiveSection (without the AI tab) + the landing contact footer.
 */
import Image from "next/image";
import { useEffect, useState } from "react";
import { TeamLiveSection } from "@/components/TeamLiveSection";
import { LandingFooter } from "@/components/LandingFooter";
import { BASE_PATH } from "@/lib/api";

const C = {
  deep: "#0b1e3d",
  brand800: "#1B3F70",
  brand500: "#2D63B0",
  accentDark: "#128F84",
  accent: "#19C3B3",
  accentLight: "#4ED9CC",
};

export function PnlStandalonePage() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      dir="rtl"
      className="relative min-h-screen overflow-x-hidden text-white"
      style={{
        background: `radial-gradient(1200px 700px at 80% -10%, ${C.brand800} 0%, transparent 55%), radial-gradient(1000px 600px at 0% 10%, ${C.accentDark}33 0%, transparent 50%), linear-gradient(180deg, ${C.deep} 0%, #081733 60%, ${C.deep} 100%)`,
      }}
    >
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-40 -top-20 h-[520px] w-[520px] rounded-full blur-[130px]" style={{ background: `${C.accent}22` }} />
        <div className="animate-blob-slow absolute -left-40 top-1/3 h-[480px] w-[480px] rounded-full blur-[130px]" style={{ background: `${C.brand500}2e` }} />
        <div className="animate-blob absolute bottom-0 right-1/3 h-[440px] w-[440px] rounded-full blur-[130px]" style={{ background: `${C.accentLight}1f` }} />
      </div>

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
          <a href="/" className="flex items-center gap-3">
            <Image
              src={`${BASE_PATH}/crypto-smart-logo-white.png`}
              alt="Crypto Smart"
              width={160}
              height={60}
              className="h-9 w-auto md:h-11"
              priority
            />
          </a>
          <div className="flex items-center gap-3 text-sm text-white/70">
            <a href="#live" className="hidden font-medium transition-colors hover:text-white sm:inline">
              برایند معاملات
            </a>
            <a href="#footer" className="font-medium transition-colors hover:text-white">
              ارتباط با ما
            </a>
          </div>
        </nav>
      </header>

      <main className="pt-20 md:pt-24">
        <TeamLiveSection showAiTab={false} />
      </main>

      <LandingFooter logoSrc={`${BASE_PATH}/crypto-smart-logo.png`} />
    </div>
  );
}
