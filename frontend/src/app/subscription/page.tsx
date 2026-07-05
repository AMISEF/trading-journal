"use client";

/**
 * Subscription / pricing page ("خرید اشتراک").
 *
 * Built with the project's own design system (glass cards, CSS-variable
 * theme tokens, blob backdrop) rather than the pasted template's stack
 * (motion, @number-flow/react, shadcn/ui) — none of those are installed
 * here, and pulling them in just for one page isn't worth the build risk.
 *
 * NOTE: prices/features below are placeholders — edit the `TIERS` array
 * with your real plans before shipping.
 */
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { faNum } from "@/lib/format";

const TINTS = {
  mint: "94,234,212",
  violet: "167,139,250",
  sky: "125,211,252",
} as const;

type Tier = {
  id: "bronze" | "silver" | "gold" | "diamond";
  name: string;
  tagline: string;
  monthly: number; // تومان
  yearly: number; // تومان
  accent: string; // hex
  features: string[];
  cta: string;
  diamond?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "bronze",
    name: "برنزی",
    tagline: "برای شروعِ ژورنال‌نویسیِ منظم",
    monthly: 0,
    yearly: 0,
    accent: "#c2793f",
    features: [
      "ثبت نامحدود معامله",
      "۱ ژورنال فعال",
      "داشبورد و نمودار equity",
      "چک‌لیست روانشناسی پایه",
    ],
    cta: "شروع رایگان",
  },
  {
    id: "silver",
    name: "نقره‌ای",
    tagline: "برای تریدرهایی که می‌خوان روندشون رو بفهمن",
    monthly: 199000,
    yearly: 1990000,
    accent: "#9aa5b1",
    features: [
      "همهٔ امکانات برنزی",
      "۳ ژورنال فعال",
      "مربی هوش مصنوعی (۱ گزارش در ماه)",
      "پشتیبانی از طریق تیکت",
    ],
    cta: "ارتقا به نقره‌ای",
  },
  {
    id: "gold",
    name: "طلایی",
    tagline: "برای تریدرهای جدی با چند استراتژی",
    monthly: 499000,
    yearly: 4990000,
    accent: "#eab308",
    features: [
      "همهٔ امکانات نقره‌ای",
      "ژورنال نامحدود",
      "مربی هوش مصنوعی نامحدود",
      "گزارش نهادی (Institutional) ماهانه",
      "پشتیبانی اولویت‌دار",
    ],
    cta: "ارتقا به طلایی",
  },
  {
    id: "diamond",
    name: "الماسی",
    tagline: "بالاترین سطح تحلیل و پشتیبانی",
    monthly: 999000,
    yearly: 9990000,
    accent: "#22d3ee",
    diamond: true,
    features: [
      "همهٔ امکانات طلایی",
      "گزارش نهادی نامحدود",
      "تحلیل هفتگیِ خودکار",
      "دسترسی زودهنگام به امکانات جدید",
      "پشتیبانی اختصاصی",
    ],
    cta: "ارتقا به الماسی",
  },
];

function DiamondIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M6 3h12l3 5-9 13L3 8z" />
      <path d="M3 8h18M8 3l4 5-4 13M16 3l-4 5 4 13" />
    </svg>
  );
}

function PeriodToggle({
  yearly,
  onChange,
}: {
  yearly: boolean;
  onChange: (yearly: boolean) => void;
}) {
  return (
    <div className="glass inline-flex items-center gap-1 p-1">
      {(
        [
          { key: false, label: "ماهانه" },
          { key: true, label: "سالانه" },
        ] as const
      ).map((opt) => (
        <button
          key={String(opt.key)}
          onClick={() => onChange(opt.key)}
          className={`rounded-xl px-5 py-2 text-sm font-medium transition-colors ${
            yearly === opt.key
              ? "bg-primary text-white"
              : "text-muted hover:text-text"
          }`}
        >
          {opt.label}
          {opt.key && (
            <span className="mr-1.5 text-xs opacity-80">(۲ ماه رایگان)</span>
          )}
        </button>
      ))}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function PriceTag({ toman }: { toman: number }) {
  if (toman === 0) {
    return <span className="text-4xl font-extrabold">رایگان</span>;
  }
  return (
    <div className="flex items-baseline gap-1.5" dir="ltr">
      <span className="text-4xl font-extrabold">{faNum(toman.toLocaleString("en-US"))}</span>
      <span className="text-sm text-muted">تومان</span>
    </div>
  );
}

function TierCard({ tier, yearly }: { tier: Tier; yearly: boolean }) {
  const price = yearly ? tier.yearly : tier.monthly;

  const card = (
    <div className="glass relative flex h-full flex-col gap-6 p-6">
      {tier.diamond && (
        <span className="absolute -top-3 right-6 rounded-full bg-gradient-to-l from-sky-400 to-violet-400 px-3 py-1 text-xs font-bold text-white shadow">
          محبوب‌ترین
        </span>
      )}

      <div className="flex items-center gap-2.5">
        <span
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{ background: `${tier.accent}22`, color: tier.accent }}
        >
          {tier.diamond ? <DiamondIcon className="h-5 w-5" /> : (
            <span className="h-3 w-3 rounded-full" style={{ background: tier.accent }} />
          )}
        </span>
        <div>
          <div className="text-lg font-bold">{tier.name}</div>
          <div className="text-xs text-muted">{tier.tagline}</div>
        </div>
      </div>

      <PriceTag toman={price} />

      <button
        className="w-full rounded-xl py-3 text-sm font-bold transition-opacity hover:opacity-90"
        style={
          tier.diamond
            ? { background: "linear-gradient(90deg,#22d3ee,#a78bfa)", color: "#06121a" }
            : { background: "var(--primary)", color: "#fff" }
        }
      >
        {tier.cta}
      </button>

      <ul className="space-y-2.5 border-t border-border pt-4 text-sm">
        {tier.features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <span
              className="mt-0.5 grid h-4 w-4 flex-none place-items-center rounded-full"
              style={{ background: `${tier.accent}22`, color: tier.accent }}
            >
              <CheckIcon />
            </span>
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );

  if (!tier.diamond) return card;

  // Diamond tier: signature rotating-gradient border.
  return (
    <div className="relative rounded-[1.5rem] p-[2px]">
      <div
        className="animate-spin-slow absolute inset-[-40%] rounded-full opacity-70"
        style={{
          background:
            "conic-gradient(from 0deg, #22d3ee, #a78bfa, #f472b6, #22d3ee)",
        }}
      />
      <div className="relative rounded-[1.5rem] bg-bg">{card}</div>
    </div>
  );
}

export default function SubscriptionPage() {
  return (
    <AppShell>
      <SubscriptionInner />
    </AppShell>
  );
}

function SubscriptionInner() {
  const [yearly, setYearly] = useState(false);

  return (
    <div className="relative space-y-8">
      {/* ── Ambient pastel glow backdrop ── */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="animate-blob absolute -right-32 top-0 h-[480px] w-[480px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.sky},0.16)` }} />
        <div className="animate-blob-slow absolute -left-32 top-1/3 h-[440px] w-[440px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.violet},0.14)` }} />
        <div className="animate-blob absolute bottom-0 right-1/4 h-[400px] w-[400px] rounded-full blur-[120px]" style={{ background: `rgba(${TINTS.mint},0.12)` }} />
      </div>

      {/* ── Title ── */}
      <div className="space-y-3 text-center">
        <h1
          className="text-3xl font-extrabold tracking-tight"
          style={{
            backgroundImage: `linear-gradient(120deg, rgb(${TINTS.sky}), rgb(${TINTS.violet}), rgb(${TINTS.mint}))`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
          }}
        >
          خرید اشتراک
        </h1>
        <p className="mx-auto max-w-lg text-sm text-muted">
          سطح مناسبِ حجم معاملات و عمقِ تحلیلی که نیاز داری رو انتخاب کن — از ثبتِ ساده تا گزارش نهادیِ کامل.
        </p>
        <div className="flex justify-center pt-1">
          <PeriodToggle yearly={yearly} onChange={setYearly} />
        </div>
      </div>

      {/* ── Tiers ── */}
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {TIERS.map((tier) => (
          <TierCard key={tier.id} tier={tier} yearly={yearly} />
        ))}
      </div>
    </div>
  );
}
