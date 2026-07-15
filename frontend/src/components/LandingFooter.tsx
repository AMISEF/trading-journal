"use client";

/**
 * Shared contact / social footer used on the marketing landing and the
 * standalone PnL showcase (pnl.cryptosmart.site).
 */
import Image from "next/image";
import { BASE_PATH } from "@/lib/api";

const C = {
  accent: "#19C3B3",
  accentLight: "#4ED9CC",
};

export function LandingFooter({
  logoSrc,
}: {
  /** Optional override for the footer logo (defaults to logo-icon). */
  logoSrc?: string;
}) {
  const social = [
    { label: "Telegram", href: "https://t.me/cryptosmart_org", icon: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /> },
    { label: "Aparat", href: "https://www.aparat.com/CryptoSmart", icon: <><circle cx="12" cy="12" r="9.5" /><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor" stroke="none" /></> },
    { label: "YouTube", href: "https://www.youtube.com/@Cryptosmart_org", icon: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></> },
    { label: "Instagram", href: "https://www.instagram.com/cryptosmart_org/", icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></> },
  ];

  const src = logoSrc ?? `${BASE_PATH}/logo-icon.png`;

  return (
    <footer
      id="footer"
      className="relative mt-10 scroll-mt-24 border-t border-white/10"
      style={{ background: "rgba(8,20,42,0.6)", backdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto max-w-5xl px-5 py-14 text-center md:px-8">
        <Image src={src} alt="Crypto Smart" width={64} height={64} className="mx-auto rounded-2xl" />
        <div className="mt-4 text-xl font-extrabold tracking-widest">
          CRYPTO <span style={{ color: C.accent }}>SMART</span>
        </div>
        <p className="mt-2 text-sm text-white/55">شروع هوشمند، معامله هوشمند</p>
        <p className="mt-1 text-sm font-semibold tracking-wide text-white/80" dir="ltr">
          Start <span style={{ color: C.accent }}>Smart</span> , Trade{" "}
          <span style={{ color: C.accent }}>Smarter</span>
        </p>

        <div className="mt-8 flex items-center justify-center text-sm text-white/70">
          <a
            href="https://t.me/cryptosmart_sup"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 transition-colors hover:text-white"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={C.accentLight} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" />
            </svg>
            پشتیبان تلگرام: <span dir="ltr" className="font-medium">@cryptosmart_sup</span>
          </a>
        </div>

        <p className="mt-8 text-sm text-white/55">ما را دنبال کنید</p>
        <div className="mt-3 flex items-center justify-center gap-3">
          {social.map((s) => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={s.label}
              className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 text-white/75 transition-all hover:-translate-y-1 hover:text-white"
              style={{ boxShadow: `0 10px 26px -14px ${C.accent}` }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {s.icon}
              </svg>
            </a>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-5 py-5 text-xs text-white/45 md:flex-row md:px-8">
          <span>© CRYPTO SMART ۱۴۰۵. تمامی حقوق محفوظ است.</span>
          <span>ساخته‌شده برای معامله‌گران حرفه‌ای</span>
        </div>
      </div>
    </footer>
  );
}
