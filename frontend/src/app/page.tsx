"use client";

/**
 * Public landing page (/).
 * A full marketing page introducing Crypto Smart trading journal, with
 * animated glass sections, a pricing showcase, and a rich footer. Visitors
 * enter the app via the ورود / ثبت‌نام buttons.
 */
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { getToken, BASE_PATH } from "@/lib/api";

// ── Brand palette (from the design tokens the product owner provided) ─────────
const C = {
  deep: "#0b1e3d",
  dark900: "#162F55",
  brand800: "#1B3F70",
  brand700: "#214E8A",
  brand500: "#2D63B0",
  brand300: "#6F95C8",
  accentDark: "#128F84",
  accent: "#19C3B3",
  accentLight: "#4ED9CC",
  accentGlow: "#A6F0E8",
  gray100: "#F3F6F9",
  gray300: "#DCE2E7",
  gray500: "#BFC7CE",
  gray700: "#5A646D",
};

// Motion helpers
const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};

// ── Data ─────────────────────────────────────────────────────────────────────
const FEATURES = [
  {
    title: "ثبت کامل هر معامله",
    desc: "ورود، خروج، حجم، تصویر چارت، چک‌لیست و احساسات — همه‌چیز یک‌جا و منظم.",
    icon: (
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    ),
  },
  {
    title: "داشبورد و منحنی سرمایه",
    desc: "وین‌ریت، ضریب سود، میانگین R:R و رشد حساب را زنده و دقیق ببین.",
    icon: <path d="M3 3v18h18M7 15l4-4 3 3 5-6" />,
  },
  {
    title: "تحلیل با هوش مصنوعی",
    desc: "تک‌تک معاملاتت را هوش مصنوعی بررسی می‌کند و نقاط قوت و ضعفت را می‌گوید.",
    icon: (
      <>
        <path d="M12 2a5 5 0 0 0-5 5c0 1.2.5 2.3 1.3 3.1L8 12l-1 3h10l-1-3-.3-1.9A5 5 0 0 0 17 7a5 5 0 0 0-5-5z" />
        <path d="M9 21h6M10 17.5v2M14 17.5v2" />
      </>
    ),
  },
  {
    title: "مربی هوش مصنوعی",
    desc: "مربی شخصی که کل ژورنالت را می‌خواند و برای رشد، برنامه‌ی عملی می‌دهد.",
    icon: <path d="M12 2l2.4 7.4H22l-6 4.5 2.3 7.1-6.3-4.6-6.3 4.6 2.3-7.1-6-4.5h7.6z" />,
  },
  {
    title: "گزارش نهادی (Institutional)",
    desc: "گزارش عمیق و حرفه‌ای از عملکردت، در سطح تحلیل صندوق‌های سرمایه‌گذاری.",
    icon: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />,
  },
  {
    title: "سود و زیان روزانه تا ماهانه",
    desc: "PnL معاملاتت را در بازه‌های روزانه، هفتگی و ماهانه دقیق دنبال کن.",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M3 10h18M8 2v4M16 2v4" />
      </>
    ),
  },
];

const PLANS = [
  {
    name: "برنزی",
    price: "رایگان",
    unit: "همیشگی",
    tint: C.brand300,
    popular: false,
    cta: "شروع رایگان",
    features: ["ثبت تا ۵۰ معامله", "داشبورد کامل و نمودار equity", "بدون نیاز به کارت بانکی"],
  },
  {
    name: "نقره‌ای",
    price: "۳۴۹٬۰۰۰",
    unit: "تومان / ماه",
    tint: C.gray500,
    popular: false,
    cta: "انتخاب نقره‌ای",
    features: ["ثبت تا ۱۰۰ معامله", "تحلیل هوش مصنوعی معاملات", "مربی هوش مصنوعی هفتگی"],
  },
  {
    name: "طلایی",
    price: "۷۹۰٬۰۰۰",
    unit: "تومان / ماه",
    tint: C.accentLight,
    popular: true,
    cta: "انتخاب طلایی",
    features: ["ثبت نامحدود معامله", "مربی هوش مصنوعی روزانه", "گزارش نهادی هفتگی"],
  },
  {
    name: "الماسی",
    price: "۲٬۶۹۰٬۰۰۰",
    unit: "تومان / ماه",
    tint: C.accent,
    popular: false,
    cta: "انتخاب الماسی",
    features: ["همه‌چیز نامحدود", "گزارش نهادی روزانه", "۱ ماه ربات الگو آنالایزر هدیه"],
  },
];

const NAV_LINKS = [
  { href: "#features", label: "امکانات" },
  { href: "#plans", label: "پلن‌ها" },
  { href: "#footer", label: "ارتباط با ما" },
];

export default function LandingPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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
      className="relative min-h-screen overflow-x-hidden text-white"
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

      {/* ── Nav ── */}
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
            <Image src={`${BASE_PATH}/logo-icon.png`} alt="Crypto Smart" width={40} height={40} className="rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">
              CRYPTO <span style={{ color: C.accent }}>SMART</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href} className="text-sm font-medium text-white/70 transition-colors hover:text-white">
                {l.label}
              </a>
            ))}
          </div>

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

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-7xl px-5 pb-16 pt-36 md:px-8 md:pb-24 md:pt-44">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-right">
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeUp}
              className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-medium text-white/80 backdrop-blur"
            >
              <span className="h-2 w-2 animate-pulse-dot rounded-full" style={{ background: C.accent }} />
              ژورنال حرفه‌ای معاملات کریپتو + هوش مصنوعی
            </motion.div>

            <motion.h1
              initial="hidden"
              animate="show"
              custom={1}
              variants={fadeUp}
              className="text-4xl font-black leading-[1.15] tracking-tight md:text-6xl"
            >
              شروع هوشمند،
              <br />
              <span
                style={{
                  backgroundImage: `linear-gradient(120deg, ${C.accentGlow}, ${C.accentLight}, ${C.brand300})`,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                معامله‌ی هوشمندتر
              </span>
            </motion.h1>

            <motion.p
              initial="hidden"
              animate="show"
              custom={2}
              variants={fadeUp}
              className="mx-auto mt-5 max-w-xl text-base leading-8 text-white/70 md:text-lg lg:mx-0"
            >
              هر معامله را دقیق ثبت کن، عملکردت را با داشبورد و نمودارهای حرفه‌ای تحلیل کن، و بگذار
              هوش مصنوعی مثل یک مربی حرفه‌ای مسیر رشدت را نشانت بدهد.
            </motion.p>

            <motion.div
              initial="hidden"
              animate="show"
              custom={3}
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
            >
              <Link
                href="/register"
                className="rounded-2xl px-7 py-3.5 text-base font-bold text-[#0b1e3d] transition-all hover:-translate-y-1"
                style={{ background: `linear-gradient(120deg, ${C.accentLight}, ${C.accent})`, boxShadow: `0 18px 40px -14px ${C.accent}` }}
              >
                همین حالا رایگان شروع کن
              </Link>
              <Link
                href="/login"
                className="rounded-2xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white/90 transition-all hover:border-white/40 hover:bg-white/5"
              >
                ورود به حساب
              </Link>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="show"
              custom={4}
              variants={fadeUp}
              className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-white/60 lg:justify-start"
            >
              {["پلن رایگان همیشگی", "تحلیل با هوش مصنوعی"].map((t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  {t}
                </span>
              ))}
            </motion.div>
          </div>

          {/* Hero mockup card */}
          <motion.div
            initial={{ opacity: 0, y: 40, rotateX: 8 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative mx-auto w-full max-w-md"
          >
            <div
              className="relative overflow-hidden rounded-3xl p-6 backdrop-blur-2xl"
              style={{
                background: "linear-gradient(155deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03))",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: `0 40px 90px -30px ${C.accent}66, inset 0 1px 0 rgba(255,255,255,0.18)`,
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image src={`${BASE_PATH}/logo-icon.png`} alt="" width={28} height={28} className="rounded-lg" />
                  <span className="text-sm font-bold">داشبورد معاملات</span>
                </div>
                <span className="h-2.5 w-2.5 animate-pulse-dot rounded-full" style={{ background: C.accent }} />
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  { l: "موجودی فعلی", v: "$۱۲٬۴۸۰", c: C.accentLight },
                  { l: "سود این ماه", v: "+٪۱۸٫۶", c: C.accent },
                  { l: "وین‌ریت", v: "٪۶۴", c: C.brand300 },
                  { l: "میانگین R:R", v: "۲٫۳", c: C.accentGlow },
                ].map((k) => (
                  <div key={k.l} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[11px] text-white/60">{k.l}</div>
                    <div className="mt-1 text-lg font-extrabold" style={{ color: k.c }} dir="ltr">
                      {k.v}
                    </div>
                  </div>
                ))}
              </div>

              {/* mini equity bars */}
              <div className="mt-4 flex h-24 items-end gap-1.5 rounded-2xl border border-white/10 bg-white/5 p-3">
                {[38, 52, 44, 66, 58, 74, 63, 82, 70, 90].map((h, i) => (
                  <motion.div
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h}%` }}
                    transition={{ duration: 0.8, delay: 0.5 + i * 0.06, ease: "easeOut" }}
                    className="flex-1 rounded-t-md"
                    style={{ background: `linear-gradient(to top, ${C.accentDark}, ${C.accentLight})` }}
                  />
                ))}
              </div>
            </div>

            {/* floating badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1, duration: 0.5 }}
              className="absolute -bottom-5 -left-5 rounded-2xl px-4 py-2.5 text-sm font-bold text-[#0b1e3d] shadow-xl"
              style={{ background: `linear-gradient(120deg, ${C.accentGlow}, ${C.accentLight})` }}
            >
              🤖 تحلیل هوش مصنوعی
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ── Features ── */}
      <section id="features" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
        <SectionHeading
          badge="امکانات"
          title="هرچه یک تریدر حرفه‌ای نیاز دارد"
          subtitle="ابزارهایی که کمک می‌کنند از هر معامله درس بگیری و مداوم پیشرفت کنی."
        />
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.title}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.3 }}
              custom={i}
              variants={fadeUp}
              className="group relative overflow-hidden rounded-3xl p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1.5"
              style={{
                background: "linear-gradient(155deg, rgba(255,255,255,0.08), rgba(255,255,255,0.02))",
                border: "1px solid rgba(255,255,255,0.10)",
                boxShadow: `0 24px 60px -34px ${C.accent}55`,
              }}
            >
              <div
                className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-40 blur-2xl transition-opacity duration-300 group-hover:opacity-80"
                style={{ background: `${C.accent}55` }}
              />
              <div
                className="relative mb-4 grid h-12 w-12 place-items-center rounded-2xl"
                style={{ background: `${C.accent}1f`, border: `1px solid ${C.accent}55`, color: C.accentLight }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {f.icon}
                </svg>
              </div>
              <h3 className="relative mb-2 text-lg font-bold">{f.title}</h3>
              <p className="relative text-sm leading-7 text-white/65">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Plans ── */}
      <section id="plans" className="relative mx-auto max-w-7xl scroll-mt-24 px-5 py-16 md:px-8 md:py-24">
        <SectionHeading
          badge="پلن‌های اشتراک"
          title="سطح مناسب خودت را انتخاب کن"
          subtitle="از پلن رایگان همیشگی تا دسترسی کامل و گزارش نهادی روزانه."
        />
        <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {PLANS.map((p, i) => (
            <motion.div
              key={p.name}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, amount: 0.25 }}
              custom={i}
              variants={fadeUp}
              className="group relative flex flex-col overflow-hidden rounded-3xl p-6 backdrop-blur-xl transition-all duration-300 hover:-translate-y-2"
              style={{
                background: `linear-gradient(155deg, ${p.tint}26 0%, ${p.tint}0d 45%, rgba(255,255,255,0.03) 100%)`,
                border: `1px solid ${p.tint}${p.popular ? "88" : "3a"}`,
                boxShadow: p.popular ? `0 34px 80px -30px ${p.tint}` : `0 24px 60px -34px ${p.tint}aa`,
              }}
            >
              {p.popular && (
                <div
                  className="absolute -top-0 right-6 rounded-b-xl px-3 py-1 text-xs font-bold text-[#0b1e3d]"
                  style={{ background: `linear-gradient(to left, ${p.tint}, ${C.accentGlow})` }}
                >
                  محبوب‌ترین
                </div>
              )}
              <div
                className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full opacity-50 blur-3xl"
                style={{ background: `${p.tint}66` }}
              />
              <h3 className="relative text-xl font-extrabold" style={{ color: p.tint }}>
                {p.name}
              </h3>
              <div className="relative mt-3 flex items-end gap-1.5">
                <span className="text-3xl font-black tracking-tight" dir="ltr">
                  {p.price}
                </span>
                <span className="mb-1 text-xs text-white/60">{p.unit}</span>
              </div>

              <ul className="relative mt-5 flex-grow space-y-3 border-t border-white/10 pt-5">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-white/75">
                    <span
                      className="mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full text-[10px]"
                      style={{ background: `${p.tint}33`, color: p.tint }}
                    >
                      ✓
                    </span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/register"
                className="relative mt-6 w-full rounded-xl py-3 text-center text-sm font-bold transition-all"
                style={
                  p.popular
                    ? { background: `linear-gradient(to right, ${p.tint}, ${C.accent})`, color: "#0b1e3d", boxShadow: `0 12px 30px -10px ${p.tint}` }
                    : { background: `${p.tint}1f`, border: `1px solid ${p.tint}66`, color: p.tint }
                }
              >
                {p.cta}
              </Link>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-white/50">
          پلن‌های ۳، ۶ و ۱۲ ماهه با تخفیف ویژه هم موجودند — بعد از ورود، در بخش «مدیریت اشتراک».
        </p>
      </section>

      {/* ── CTA band ── */}
      <section className="relative mx-auto max-w-7xl px-5 py-10 md:px-8">
        <motion.div
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.4 }}
          variants={fadeUp}
          className="relative overflow-hidden rounded-[2rem] px-6 py-12 text-center md:px-16 md:py-16"
          style={{
            background: `linear-gradient(120deg, ${C.brand700}, ${C.brand800})`,
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: `0 40px 90px -40px ${C.accent}`,
          }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full opacity-40 blur-3xl" style={{ background: `${C.accent}` }} />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: `${C.accentLight}` }} />
          <h2 className="relative text-2xl font-black md:text-4xl">همین امروز ژورنالت را بساز</h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/75">
            رایگان شروع کن، و وقتی به امکانات بیشتر نیاز داشتی ارتقا بده. ساده، سریع و بدون ریسک.
          </p>
          <Link
            href="/register"
            className="relative mt-7 inline-block rounded-2xl px-8 py-3.5 text-base font-bold text-[#0b1e3d] transition-all hover:-translate-y-1"
            style={{ background: `linear-gradient(120deg, ${C.accentGlow}, ${C.accentLight}, ${C.accent})`, boxShadow: `0 18px 44px -14px ${C.accentGlow}` }}
          >
            ساخت حساب رایگان
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ── */}
      <Footer />
    </div>
  );
}

function SectionHeading({ badge, title, subtitle }: { badge: string; title: string; subtitle: string }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      variants={fadeUp}
      className="mx-auto max-w-2xl text-center"
    >
      <span
        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold"
        style={{ color: C.accentLight }}
      >
        {badge}
      </span>
      <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 text-white/65">{subtitle}</p>
    </motion.div>
  );
}

function Footer() {
  const social = [
    { label: "Telegram", href: "https://t.me/cryptosmart_org", icon: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z" /> },
    { label: "Aparat", href: "https://www.aparat.com/CryptoSmart", icon: <><circle cx="12" cy="12" r="9.5" /><path d="m10 8.5 5.5 3.5-5.5 3.5z" fill="currentColor" stroke="none" /></> },
    { label: "YouTube", href: "https://www.youtube.com/@Cryptosmart_org", icon: <><rect x="2" y="5" width="20" height="14" rx="4" /><path d="m10 9 5 3-5 3z" /></> },
    { label: "Instagram", href: "https://www.instagram.com/cryptosmart_org/", icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></> },
  ];

  return (
    <footer
      id="footer"
      className="relative mt-10 scroll-mt-24 border-t border-white/10"
      style={{ background: "rgba(8,20,42,0.6)", backdropFilter: "blur(14px)" }}
    >
      <div className="mx-auto max-w-5xl px-5 py-14 text-center md:px-8">
        <Image src={`${BASE_PATH}/logo-icon.png`} alt="Crypto Smart" width={64} height={64} className="mx-auto rounded-2xl" />
        <div className="mt-4 text-xl font-extrabold tracking-widest">
          CRYPTO <span style={{ color: C.accent }}>SMART</span>
        </div>
        <p className="mt-2 text-sm text-white/55">شروع هوشمند، معامله هوشمند</p>
        <p className="mt-1 text-sm font-semibold tracking-wide text-white/80" dir="ltr">
          Start <span style={{ color: C.accent }}>Smart</span> , Trade{" "}
          <span style={{ color: C.accent }}>Smarter</span>
        </p>

        {/* contact */}
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

        {/* follow us */}
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
