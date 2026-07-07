"use client";

import { Sparkles as SparklesComp } from "@/components/ui/sparkles";
import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { useLayoutEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { faNum } from "@/lib/format";
import { formatJalaliDate } from "@/lib/jalali";
import { useAuth } from "@/store/auth";

// ── Billing periods ─────────────────────────────────────────────────────────
// `months` = calendar months of access. `paidMonths` = months actually billed
// (the discount rule the product owner defined):
//   • ۳ ماهه  → قیمت ۳ ماه خط می‌خورد، فقط ۲ ماه پرداخت می‌شود
//   • ۶ ماهه  → قیمت ۶ ماه خط می‌خورد، فقط ۴ ماه پرداخت می‌شود
//   • سالانه  → قیمت ۱۲ ماه خط می‌خورد، فقط ۸ ماه پرداخت می‌شود
const PERIODS = [
  { key: "0", months: 1, paidMonths: 1, label: "ماهانه" },
  { key: "1", months: 3, paidMonths: 2, label: "۳ ماهه" },
  { key: "2", months: 6, paidMonths: 4, label: "۶ ماهه" },
  { key: "3", months: 12, paidMonths: 8, label: "سالانه" },
] as const;

type Period = (typeof PERIODS)[number];

/** Discount % of a period vs. paying month-by-month (rounded). */
const discountPct = (p: Period) => Math.round((1 - p.paidMonths / p.months) * 100);
/** Full (struck-through) price for the whole period at the monthly rate. */
const fullPrice = (monthly: number, p: Period) => monthly * p.months;
/** Discounted price actually charged for the period. */
const payPrice = (monthly: number, p: Period) => monthly * p.paidMonths;

const round1000 = (n: number) => Math.round(n / 1000) * 1000;

// ── Plans ───────────────────────────────────────────────────────────────────
// `tier` maps to the backend subscription tier; `tint` is the "R,G,B" wash used
// across the glass card + selected-plan chrome.
const plans = [
  {
    tier: "bronze",
    name: "برنزی",
    tint: "251,146,60", // orange
    description: "برای شروع بدون ریسک — همین امروز ژورنالت رو بساز",
    monthlyPrice: 0,
    buttonText: "شروع رایگان",
    popular: false,
    includes: [
      "ثبت تا ۵۰ معامله با تمام جزئیات (ورود، خروج، تصویر، چک‌لیست، احساسات)",
      "داشبورد کامل و نمودار equity",
      "همیشه رایگان — بدون نیاز به کارت بانکی",
    ],
  },
  {
    tier: "silver",
    name: "نقره‌ای",
    tint: "148,163,184", // slate
    description: "برای تریدرهایی که می‌خوان از هر معامله درس بگیرن",
    monthlyPrice: 349000,
    buttonText: "ارتقا به نقره‌ای",
    popular: false,
    includes: [
      "ثبت تا ۱۰۰ معامله با تمام جزئیات",
      "تحلیل هوش مصنوعی روی تک‌تک معاملات",
      "مربی هوش مصنوعی، هفته‌ای ۱ بار",
      "همه‌ی امکانات پلن برنزی",
    ],
  },
  {
    tier: "gold",
    name: "طلایی",
    tint: "251,191,36", // amber
    description: "انتخاب اکثر تریدرهای فعال — تحلیل روزانه، بدون سقف معامله",
    monthlyPrice: 790000,
    buttonText: "ارتقا به طلایی",
    popular: true,
    includes: [
      "ثبت نامحدود معامله",
      "تحلیل هوش مصنوعی روی تک‌تک معاملات",
      "مربی هوش مصنوعی، هر روز ۱ بار",
      "گزارش و تحلیل نهادی (Institutional) ژورنال، هفته‌ای ۱ بار",
      "همه‌ی امکانات پلن نقره‌ای",
    ],
  },
  {
    tier: "diamond",
    name: "الماسی",
    tint: "34,211,238", // cyan
    description: "بدون هیچ سقفی — دسترسی کامل + ربات الگو آنالایزر هدیه",
    monthlyPrice: 2690000,
    buttonText: "ارتقا به الماسی",
    popular: false,
    includes: [
      "ثبت نامحدود معامله",
      "مربی هوش مصنوعی نامحدود",
      "گزارش و تحلیل نهادی ژورنال، روزانه ۱ بار",
      "۱ ماه اشتراک نامحدود ربات الگو آنالایزر، هدیه‌ی ویژه‌ی پلن الماسی",
      "همه‌ی امکانات پلن طلایی",
    ],
  },
] as const;

const TIER_LABEL: Record<string, string> = {
  bronze: "برنزی",
  silver: "نقره‌ای",
  gold: "طلایی",
  diamond: "الماسی",
};
const TIER_TINT: Record<string, string> = {
  bronze: "251,146,60",
  silver: "148,163,184",
  gold: "251,191,36",
  diamond: "34,211,238",
};

// ── Billing-period switch ─────────────────────────────────────────────────────
// A measured sliding indicator (no framer `layoutId`, which got stuck on the
// first tab in RTL). The pill's position/width is read straight off the active
// button, so it tracks every period reliably.
const PricingSwitch = ({
  selected,
  onSwitch,
}: {
  selected: string;
  onSwitch: (value: string) => void;
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useLayoutEffect(() => {
    const btn = btnRefs.current[selected];
    const container = containerRef.current;
    if (!btn || !container) return;
    const update = () =>
      setIndicator({ left: btn.offsetLeft, width: btn.offsetWidth });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [selected]);

  return (
    <div className="flex justify-center" dir="rtl">
      <div
        ref={containerRef}
        className="relative z-10 mx-auto flex w-fit flex-wrap items-center gap-1 rounded-full border border-white/10 bg-white/5 p-1 backdrop-blur-xl"
        style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08), 0 12px 40px -18px rgba(37,99,235,0.5)" }}
      >
        {/* Sliding glass pill */}
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 h-[calc(100%-0.5rem)] rounded-full border border-blue-400/60 bg-gradient-to-t from-blue-500 to-blue-600 shadow-[0_6px_20px_-4px_rgba(37,99,235,0.8)] transition-all duration-300 ease-out"
          style={{ left: indicator.left, width: indicator.width }}
        />
        {PERIODS.map((opt) => (
          <button
            key={opt.key}
            ref={(el) => {
              btnRefs.current[opt.key] = el;
            }}
            onClick={() => onSwitch(opt.key)}
            className={cn(
              "relative z-10 flex h-10 w-fit flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1 font-medium transition-colors sm:px-5 sm:py-2",
              selected === opt.key ? "text-white" : "text-gray-300 hover:text-white"
            )}
          >
            {opt.label}
            {discountPct(opt) > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                  selected === opt.key ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                ٪{faNum(discountPct(opt))} تخفیف
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default function SubscriptionPage() {
  return (
    <AppShell>
      <SubscriptionInner />
    </AppShell>
  );
}

function CurrentPlanCard() {
  const user = useAuth((s) => s.user);
  if (!user) return null;

  const tier = (user.subscriptionTier || "bronze").toLowerCase();
  const tint = TIER_TINT[tier] ?? TIER_TINT.bronze;
  const label = TIER_LABEL[tier] ?? tier;
  const expires = user.subscriptionExpiresAt;

  // Remaining days (only meaningful for a paid, dated plan).
  let remaining: number | null = null;
  if (expires) {
    const ms = new Date(expires).getTime() - Date.now();
    remaining = ms > 0 ? Math.ceil(ms / 86_400_000) : 0;
  }

  return (
    <div
      className="relative mx-auto mb-2 w-full max-w-md overflow-hidden rounded-3xl p-5 backdrop-blur-xl"
      style={{
        background: `linear-gradient(150deg, rgba(${tint},0.22) 0%, rgba(${tint},0.06) 55%, rgba(255,255,255,0.04) 100%)`,
        border: `1px solid rgba(${tint},0.35)`,
        boxShadow: `0 20px 60px -28px rgba(${tint},0.6), inset 0 1px 0 rgba(255,255,255,0.12)`,
      }}
    >
      <div
        className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full opacity-60 blur-3xl"
        style={{ background: `rgba(${tint},0.5)` }}
      />
      <div className="relative flex items-center justify-between gap-4">
        <div>
          <div className="text-xs font-medium text-gray-300">پلن فعلی شما</div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="inline-flex h-8 items-center rounded-full px-3 text-sm font-extrabold"
              style={{ background: `rgba(${tint},0.2)`, color: `rgb(${tint})`, border: `1px solid rgba(${tint},0.4)` }}
            >
              {label}
            </span>
            {tier === "bronze" && <span className="text-xs text-gray-400">(رایگان)</span>}
          </div>
        </div>
        <div className="text-left">
          <div className="text-xs font-medium text-gray-300">مدت اشتراک</div>
          {tier === "bronze" ? (
            <div className="mt-1 text-sm font-bold text-gray-200">همیشگی</div>
          ) : expires ? (
            <>
              <div className="mt-1 text-sm font-bold" style={{ color: `rgb(${tint})` }}>
                {remaining === 0 ? "منقضی شده" : `${faNum(remaining ?? 0)} روز باقی‌مانده`}
              </div>
              <div className="text-[11px] text-gray-400" dir="ltr">
                تا {formatJalaliDate(expires)}
              </div>
            </>
          ) : (
            <div className="mt-1 text-sm font-bold text-gray-200">نامحدود</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SubscriptionInner() {
  const [periodKey, setPeriodKey] = useState("0");
  const period = PERIODS.find((p) => p.key === periodKey)!;
  const pricingRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: { delay: i * 0.4, duration: 0.5 },
    }),
    hidden: { filter: "blur(10px)", y: -20, opacity: 0 },
  };

  const handleSupportClick = () => {
    window.open("https://t.me/cryptosmart_sup", "_blank");
  };

  return (
    <div
      className="min-h-screen mx-auto relative overflow-x-hidden rounded-3xl"
      ref={pricingRef}
      dir="rtl"
      style={{ backgroundColor: "#060b13" }}
    >
      <TimelineContent
        animationNum={4}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute top-0 h-96 w-full overflow-hidden [mask-image:radial-gradient(50%_50%,white,transparent)] "
      >
        <div className="absolute bottom-0 left-0 right-0 top-0 bg-[linear-gradient(to_right,#ffffff2c_1px,transparent_1px),linear-gradient(to_bottom,#3a3a3a01_1px,transparent_1px)] bg-[size:70px_80px] "></div>
        <SparklesComp
          density={1800}
          direction="bottom"
          speed={1}
          color="#FFFFFF"
          className="absolute inset-x-0 bottom-0 h-full w-full [mask-image:radial-gradient(50%_50%,white,transparent_85%)]"
        />
      </TimelineContent>
      <TimelineContent
        animationNum={5}
        timelineRef={pricingRef}
        customVariants={revealVariants}
        className="absolute left-0 top-[-114px] w-full h-[113.625vh] flex flex-col items-start justify-start content-start flex-none flex-nowrap gap-2.5 overflow-hidden p-0 z-0 pointer-events-none"
      >
        <div className="w-full flex justify-center">
          <div
            className="absolute top-0 h-[2053px] w-[2000px] flex-none rounded-full"
            style={{
              border: "200px solid rgba(49, 49, 245, 0.4)",
              filter: "blur(150px)",
              WebkitFilter: "blur(150px)",
            }}
          ></div>
        </div>
      </TimelineContent>

      <article className="text-center mb-6 pt-32 max-w-3xl mx-auto space-y-2 relative z-50 px-4">
        <h2 className="text-4xl font-medium text-white mb-6">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.15}
            staggerFrom="last"
            reverse={true}
            containerClassName="justify-center"
            transition={{ type: "spring", stiffness: 250, damping: 40, delay: 0 }}
          >
            مدیریت اشتراک
          </VerticalCutReveal>
        </h2>

        <TimelineContent
          as="p"
          animationNum={0}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="text-gray-300 text-lg mb-8 max-w-xl mx-auto"
        >
          سطح مناسب حجم معاملات و عمق تحلیلی که نیاز داری رو انتخاب کن - از ثبت ساده تا گزارش نهادی کامل.
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={1}
          timelineRef={pricingRef}
          customVariants={revealVariants}
          className="mb-6"
        >
          <CurrentPlanCard />
        </TimelineContent>

        <TimelineContent
          as="div"
          animationNum={2}
          timelineRef={pricingRef}
          customVariants={revealVariants}
        >
          <PricingSwitch selected={periodKey} onSwitch={setPeriodKey} />
        </TimelineContent>
      </article>

      <div
        className="absolute top-0 left-[10%] right-[10%] w-[80%] h-full z-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at center, #206ce8 0%, transparent 70%)`,
          opacity: 0.2,
          mixBlendMode: "screen",
        }}
      />

      <div className="grid md:grid-cols-2 lg:grid-cols-4 max-w-[1200px] gap-6 py-12 mx-auto px-4 sm:px-6 relative z-10">
        {plans.map((plan, index) => {
          const isFree = plan.monthlyPrice === 0;
          const full = round1000(fullPrice(plan.monthlyPrice, period));
          const pay = round1000(payPrice(plan.monthlyPrice, period));
          const perMonth = round1000(pay / period.months);
          return (
            <TimelineContent
              key={plan.name}
              as="div"
              animationNum={3 + index}
              timelineRef={pricingRef}
              customVariants={revealVariants}
            >
              <div
                className="group relative flex h-full flex-col overflow-hidden rounded-3xl p-6 text-white backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1.5"
                style={{
                  background: `linear-gradient(155deg, rgba(${plan.tint},0.16) 0%, rgba(${plan.tint},0.04) 45%, rgba(255,255,255,0.03) 100%)`,
                  border: `1px solid rgba(${plan.tint},${plan.popular ? 0.5 : 0.28})`,
                  boxShadow: plan.popular
                    ? `0 30px 80px -30px rgba(${plan.tint},0.7), inset 0 1px 0 rgba(255,255,255,0.14)`
                    : `0 20px 60px -30px rgba(${plan.tint},0.5), inset 0 1px 0 rgba(255,255,255,0.08)`,
                }}
              >
                {/* Ambient corner glow */}
                <div
                  className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full opacity-60 blur-3xl transition-opacity duration-300 group-hover:opacity-100"
                  style={{ background: `rgba(${plan.tint},0.45)` }}
                />
                {/* Top sheen */}
                <div
                  className="absolute inset-x-8 top-0 h-px animate-sheen"
                  style={{ background: `linear-gradient(90deg, transparent, rgba(${plan.tint},0.9), transparent)` }}
                />

                {plan.popular && (
                  <div
                    className="absolute -top-0 right-6 rounded-b-xl px-3 py-1 text-xs font-bold text-white shadow-lg"
                    style={{ background: `linear-gradient(to left, rgb(${plan.tint}), rgba(${plan.tint},0.6))` }}
                  >
                    محبوب‌ترین
                  </div>
                )}

                <div className="relative pb-4 text-right">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-2xl font-bold" style={{ color: `rgb(${plan.tint})` }}>
                      {plan.name}
                    </h3>
                  </div>

                  {/* Price block */}
                  <div className="min-h-[68px]">
                    {isFree ? (
                      <div className="flex h-10 items-baseline justify-end">
                        <span className="text-4xl font-bold tracking-tight">رایگان</span>
                      </div>
                    ) : (
                      <>
                        {/* Struck-through full price for multi-month periods */}
                        {period.months > 1 && (
                          <div className="mb-1 flex items-center justify-end gap-2 text-sm text-gray-500">
                            <span className="line-through" dir="ltr">
                              {faNum(full.toLocaleString("en-US"))}
                            </span>
                            <span className="text-[10px]">تومان</span>
                            <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                              ٪{faNum(discountPct(period))} تخفیف
                            </span>
                          </div>
                        )}
                        {/* Payable price */}
                        <div className="flex items-baseline justify-end gap-2">
                          <span className="text-sm text-gray-400">تومان</span>
                          <span className="text-4xl font-bold tracking-tight" dir="ltr">
                            <NumberFlow value={pay} />
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="mt-1 h-4 text-xs text-gray-500" dir="rtl">
                    {!isFree && period.months > 1 && (
                      <>معادل {faNum(perMonth.toLocaleString("en-US"))} تومان در ماه</>
                    )}
                  </div>
                  <p className="mt-2 h-10 text-sm text-gray-400">{plan.description}</p>
                </div>

                <div className="relative flex flex-grow flex-col pt-0">
                  <button
                    onClick={handleSupportClick}
                    className="mb-8 w-full rounded-xl p-3 text-sm font-bold text-white transition-all hover:opacity-90"
                    style={
                      plan.popular
                        ? { background: `linear-gradient(to right, rgb(${plan.tint}), rgba(${plan.tint},0.7))`, boxShadow: `0 10px 30px -10px rgba(${plan.tint},0.6)` }
                        : { background: `rgba(${plan.tint},0.12)`, border: `1px solid rgba(${plan.tint},0.5)`, color: `rgb(${plan.tint})` }
                    }
                  >
                    {plan.buttonText}
                  </button>

                  <div className="flex-grow space-y-4 border-t border-white/10 pt-4">
                    <ul className="space-y-3">
                      {plan.includes.map((feature, featureIndex) => (
                        <li key={featureIndex} className="flex items-start gap-3">
                          <span
                            className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]"
                            style={{ background: `rgba(${plan.tint},0.2)`, color: `rgb(${plan.tint})` }}
                          >
                            ✓
                          </span>
                          <span className="text-sm leading-tight text-gray-300">{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </TimelineContent>
          );
        })}
      </div>
    </div>
  );
}
