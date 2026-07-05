"use client";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Sparkles as SparklesComp } from "@/components/ui/sparkles";
import { TimelineContent } from "@/components/ui/timeline-animation";
import { VerticalCutReveal } from "@/components/ui/vertical-cut-reveal";
import { cn } from "@/lib/utils";
import NumberFlow from "@number-flow/react";
import { motion } from "framer-motion";
import { useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { faNum } from "@/lib/format";

// ── Billing periods: month count + discount vs. paying monthly ──────────────
const PERIODS = [
  { key: "0", months: 1, label: "ماهانه", discountPct: 0 },
  { key: "1", months: 3, label: "۳ ماهه", discountPct: 10 },
  { key: "2", months: 6, label: "۶ ماهه", discountPct: 20 },
  { key: "3", months: 12, label: "سالانه", discountPct: 35 },
] as const;

const plans = [
  {
    name: "برنزی",
    description: "برای شروع بدون ریسک — همین امروز ژورنالت رو بساز",
    monthlyPrice: 0,
    buttonText: "شروع رایگان",
    buttonVariant: "outline" as const,
    popular: false,
    includes: [
      "ثبت تا ۵۰ معامله با تمام جزئیات (ورود، خروج، تصویر، چک‌لیست، احساسات)",
      "داشبورد کامل و نمودار equity",
      "همیشه رایگان — بدون نیاز به کارت بانکی",
    ],
  },
  {
    name: "نقره‌ای",
    description: "برای تریدرهایی که می‌خوان از هر معامله درس بگیرن",
    monthlyPrice: 249000,
    buttonText: "ارتقا به نقره‌ای",
    buttonVariant: "default" as const,
    popular: false,
    includes: [
      "ثبت تا ۱۰۰ معامله با تمام جزئیات",
      "تحلیل هوش مصنوعی روی تک‌تک معاملات",
      "مربی هوش مصنوعی، هفته‌ای ۱ بار",
      "همه‌ی امکانات پلن برنزی",
    ],
  },
  {
    name: "طلایی",
    description: "انتخاب اکثر تریدرهای فعال — تحلیل روزانه، بدون سقف معامله",
    monthlyPrice: 590000,
    buttonText: "ارتقا به طلایی",
    buttonVariant: "outline" as const,
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
    name: "الماسی",
    description: "بدون هیچ سقفی — دسترسی کامل + ربات الگو آنالایزر هدیه",
    monthlyPrice: 1290000,
    buttonText: "ارتقا به الماسی",
    buttonVariant: "outline" as const,
    popular: false,
    includes: [
      "ثبت نامحدود معامله",
      "مربی هوش مصنوعی نامحدود",
      "گزارش و تحلیل نهادی ژورنال، نامحدود",
      "۱ ماه اشتراک نامحدود ربات الگو آنالایزر، هدیه‌ی ویژه‌ی پلن الماسی",
      "همه‌ی امکانات پلن طلایی",
    ],
  },
];

const PricingSwitch = ({ onSwitch }: { onSwitch: (value: string) => void }) => {
  const [selected, setSelected] = useState("0");

  const handleSwitch = (value: string) => {
    setSelected(value);
    onSwitch(value);
  };

  return (
    <div className="flex justify-center" dir="rtl">
      <div className="relative z-10 mx-auto flex w-fit flex-wrap items-center gap-1 rounded-full bg-neutral-900 border border-gray-700 p-1">
        {PERIODS.map((opt) => (
          <button
            key={opt.key}
            onClick={() => handleSwitch(opt.key)}
            className={cn(
              "relative z-10 w-fit h-10 flex-shrink-0 rounded-full sm:px-5 px-3 sm:py-2 py-1 font-medium transition-colors",
              selected === opt.key ? "text-white" : "text-gray-200"
            )}
          >
            {selected === opt.key && (
              <motion.span
                layoutId={"switch"}
                className="absolute top-0 left-0 h-10 w-full rounded-full border-4 shadow-sm shadow-blue-600 border-blue-600 bg-gradient-to-t from-blue-500 to-blue-600"
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {opt.label}
              {opt.discountPct > 0 && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                    selected === opt.key ? "bg-white/20 text-white" : "bg-emerald-500/15 text-emerald-400"
                  )}
                >
                  ٪{faNum(opt.discountPct)} تخفیف
                </span>
              )}
            </span>
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

function SubscriptionInner() {
  const [periodKey, setPeriodKey] = useState("0");
  const period = PERIODS.find((p) => p.key === periodKey)!;
  const pricingRef = useRef<HTMLDivElement>(null);

  const revealVariants = {
    visible: (i: number) => ({
      y: 0,
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        delay: i * 0.4,
        duration: 0.5,
      },
    }),
    hidden: {
      filter: "blur(10px)",
      y: -20,
      opacity: 0,
    },
  };

  const togglePricingPeriod = (value: string) => setPeriodKey(value);

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

      <article className="text-center mb-6 pt-32 max-w-3xl mx-auto space-y-2 relative z-50">
        <h2 className="text-4xl font-medium text-white mb-6">
          <VerticalCutReveal
            splitBy="words"
            staggerDuration={0.15}
            staggerFrom="last"
            reverse={true}
            containerClassName="justify-center"
            transition={{
              type: "spring",
              stiffness: 250,
              damping: 40,
              delay: 0,
            }}
          >
            خرید اشتراک
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
        >
          <PricingSwitch onSwitch={togglePricingPeriod} />
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
        {plans.map((plan, index) => (
          <TimelineContent
            key={plan.name}
            as="div"
            animationNum={2 + index}
            timelineRef={pricingRef}
            customVariants={revealVariants}
          >
            <Card
              className={`relative h-full flex flex-col text-white border-neutral-800 ${
                plan.popular
                  ? "bg-gradient-to-br from-neutral-900 to-neutral-800 shadow-[0px_0px_50px_rgba(37,99,235,0.2)] z-20 border-blue-900/50"
                  : "bg-gradient-to-br from-[#0c121e] to-[#0a0f18] z-10"
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3 right-6 rounded-full bg-gradient-to-l from-sky-400 to-blue-600 px-3 py-1 text-xs font-bold text-white shadow-lg shadow-blue-500/30">
                  محبوب‌ترین
                </div>
              )}
              <CardHeader className="text-right pb-4 border-none">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-2xl font-bold">{plan.name}</h3>
                </div>
                <div className="flex items-baseline gap-2 justify-end mb-1 h-10">
                  {plan.monthlyPrice === 0 ? (
                    <span className="text-4xl font-bold tracking-tight">رایگان</span>
                  ) : (
                    <>
                      <span className="text-sm text-gray-400">تومان</span>
                      <span className="text-4xl font-bold tracking-tight" dir="ltr">
                        <NumberFlow
                          value={Math.round((plan.monthlyPrice * period.months * (1 - period.discountPct / 100)) / 1000) * 1000}
                        />
                      </span>
                    </>
                  )}
                </div>
                <div className="mb-2 h-4 text-xs text-gray-500" dir="rtl">
                  {plan.monthlyPrice > 0 && period.months > 1 && (
                    <>
                      معادل{" "}
                      {faNum(
                        Math.round(
                          (plan.monthlyPrice * period.months * (1 - period.discountPct / 100)) / 1000 / period.months
                        ) * 1000
                      ).toString()}{" "}
                      تومان در ماه
                      {period.discountPct > 0 && (
                        <span className="text-emerald-400"> · ٪{faNum(period.discountPct)} کمتر از ماهانه</span>
                      )}
                    </>
                  )}
                </div>
                <p className="text-sm text-gray-400 h-10">{plan.description}</p>
              </CardHeader>

              <CardContent className="pt-0 flex-grow flex flex-col border-none">
                <button
                  onClick={handleSupportClick}
                  className={`w-full mb-8 p-3 text-sm font-bold rounded-xl transition-all ${
                    plan.popular
                      ? "bg-gradient-to-r from-sky-400 to-blue-600 shadow-lg shadow-blue-500/25 border-none text-white hover:opacity-90"
                      : "bg-transparent border border-blue-500 text-blue-400 hover:bg-blue-500/10"
                  }`}
                >
                  {plan.buttonText}
                </button>

                <div className="space-y-4 pt-4 border-t border-neutral-800/50 flex-grow">
                  <ul className="space-y-3">
                    {plan.includes.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-start gap-3"
                      >
                        <span className="mt-1 flex-shrink-0 h-4 w-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px]">
                          ✓
                        </span>
                        <span className="text-sm text-gray-300 leading-tight">{feature}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TimelineContent>
        ))}
      </div>
    </div>
  );
}
