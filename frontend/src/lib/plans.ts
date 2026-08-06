/**
 * Subscription catalogue — the single place the UI learns what each tier costs,
 * unlocks and promises.
 *
 * The `limits` block mirrors `backend/app/services/plans.py` one-to-one. The
 * backend stays the authority (every quota is re-checked there); this copy only
 * exists so the interface can hide or lock what the API would refuse anyway,
 * instead of letting the user press a button that returns 403.
 *
 * The free tier is a taste, not a trial: 20 journal entries, one single-trade
 * analysis and one coach run — in total, forever. When the server refuses a
 * second use it appends {@link UPGRADE_MARKER} to the message; {@link isUpgradeError}
 * detects it and {@link upgradeMessage} strips it, so panels can swap the plain
 * red error box for a «خرید اشتراک» button pointing at {@link SUBSCRIPTION_PATH}.
 *
 * Billing periods live in the subscription page: the monthly price below is the
 * base, and 3/6/12-month periods apply the standing discount to it.
 */
import type { User } from "@/lib/types";

export type Tier = "bronze" | "silver" | "gold" | "diamond";

/** Where every upgrade call-to-action sends the user. */
export const SUBSCRIPTION_PATH = "/subscription";

/** Machine-readable flag the backend appends to plan-gate errors. */
export const UPGRADE_MARKER = "[UPGRADE]";

/** Did this error come from a subscription limit (rather than a real failure)? */
export function isUpgradeError(message: string | null | undefined): boolean {
  return !!message && message.includes(UPGRADE_MARKER);
}

/** The same message, with the internal marker removed. */
export function upgradeMessage(message: string | null | undefined): string {
  return (message ?? "").replace(UPGRADE_MARKER, "").trim();
}

export interface PlanLimits {
  /** null = unlimited */
  maxTrades: number | null;
  /** "once" = a trade may be analysed a single time, ever */
  tradeAnalysis: "once" | "unlimited";
  /** Lifetime cap on single-trade analyses for the whole account; null = uncapped. */
  tradeAnalysisQuota: number | null;
  coachEnabled: boolean;
  /** null = no cooldown (unlimited) */
  coachPeriodDays: number | null;
  /** Lifetime cap on coach runs; null = uncapped. */
  coachQuota: number | null;
  reportEnabled: boolean;
  reportPeriodDays: number | null;
  reportQuota: number | null;
  toobit: boolean;
}

export interface Plan {
  tier: Tier;
  name: string;
  /** "R,G,B" — the wash used across cards, badges and buttons. */
  tint: string;
  /** Same colour as a hex, for the landing page palette. */
  hex: string;
  monthlyPrice: number;
  /** One line that sells the tier. */
  tagline: string;
  /** Ribbon shown on the card (null = none). */
  badge: string | null;
  buttonText: string;
  /** Full feature list for the subscription page. */
  features: string[];
  /** Short list for the landing page. */
  highlights: string[];
  limits: PlanLimits;
}

export const PLANS: Plan[] = [
  {
    tier: "bronze",
    name: "برنزی",
    tint: "251,146,60",
    hex: "#FB923C",
    monthlyPrice: 0,
    tagline: "۲۰ معاملهٔ اولت را حرفه‌ای ثبت کن و یک بار طعم تحلیل هوش مصنوعی را بچش.",
    badge: null,
    buttonText: "شروع رایگان",
    features: [
      "ثبت ۲۰ معامله با تمام جزئیات: ورود پله‌ای، حد ضرر، تارگت‌ها، تصویر چارت، چک‌لیست و احساسات",
      "۱ تحلیل تک‌معامله با هوش مصنوعی — یک بار روی یک معامله، برای آشنایی با کیفیت تحلیل",
      "۱ بار مربی هوش مصنوعی روی کل ژورنال: نقاط قوت، نشتی‌های پول و برنامهٔ بهبود",
      "داشبورد کامل: وین‌ریت، فاکتور سود، R:R و منحنی رشد سرمایه",
      "پس از این سقف، برای استفادهٔ بیشتر باید یکی از پلن‌های اشتراکی را تهیه کنی",
    ],
    highlights: [
      "ثبت ۲۰ معامله",
      "۱ تحلیل تک‌معامله + ۱ بار مربی هوش مصنوعی",
      "داشبورد کامل و منحنی سرمایه",
    ],
    limits: {
      maxTrades: 20,
      tradeAnalysis: "once",
      tradeAnalysisQuota: 1,
      coachEnabled: true,
      coachPeriodDays: null,
      coachQuota: 1,
      reportEnabled: false,
      reportPeriodDays: null,
      reportQuota: 0,
      toobit: false,
    },
  },
  {
    tier: "silver",
    name: "نقره‌ای",
    tint: "148,163,184",
    hex: "#94A3B8",
    monthlyPrice: 999000,
    tagline: "هر هفته یک گزارش که می‌گوید پولت دقیقاً از کجا نشت می‌کند.",
    badge: null,
    buttonText: "ارتقا به نقره‌ای",
    features: [
      "ثبت تا ۱۰۰ معامله با تمام جزئیات",
      "تحلیل نامحدود هوش مصنوعی روی هر معامله — هر بار پلن یا خروجت را عوض کردی، دوباره بررسی کن",
      "مربی هوش مصنوعی روی کل ژورنال، هفته‌ای ۱ بار: نقاط قوت، نشتی‌های پول و برنامهٔ ۷ روزهٔ بهبود",
      "گفتگوی نامحدود با مربی دربارهٔ همان تحلیل‌ها",
      "تریدینگ پلن شخصی با دموهای آماده و همگام‌سازی با مربی هوش مصنوعی",
    ],
    highlights: ["ثبت تا ۱۰۰ معامله", "تریدینگ پلن شخصی", "مربی هوش مصنوعی هفتگی"],
    limits: {
      maxTrades: 100,
      tradeAnalysis: "unlimited",
      tradeAnalysisQuota: null,
      coachEnabled: true,
      coachPeriodDays: 7,
      coachQuota: null,
      reportEnabled: false,
      reportPeriodDays: null,
      reportQuota: 0,
      toobit: false,
    },
  },
  {
    tier: "gold",
    name: "طلایی",
    tint: "251,191,36",
    hex: "#FBBF24",
    monthlyPrice: 1999000,
    tagline: "ریتم تریدر تمام‌وقت: بازخورد روزانه، پیش از اینکه اشتباه دیروز تکرار شود.",
    badge: "محبوب‌ترین",
    buttonText: "ارتقا به طلایی",
    features: [
      "ثبت نامحدود معامله — بدون هیچ سقفی",
      "تحلیل نامحدود هوش مصنوعی روی تک‌تک معاملات",
      "مربی هوش مصنوعی، هر روز ۱ بار: عیب‌یابی روزانه پیش از باز کردن پوزیشن بعدی",
      "گزارش نهادی و بانکی، هفته‌ای ۱ بار: همان استانداردی که پراپ‌فرم‌ها با آن سرمایه می‌دهند",
      "خروجی PDF گزارش نهادی برای ارائه به سرمایه‌گذار",
      "تریدینگ پلن شخصی با دموهای آماده و همگام‌سازی با مربی هوش مصنوعی",
    ],
    highlights: ["ثبت نامحدود معامله", "تریدینگ پلن شخصی", "گزارش نهادی هفتگی"],
    limits: {
      maxTrades: null,
      tradeAnalysis: "unlimited",
      tradeAnalysisQuota: null,
      coachEnabled: true,
      coachPeriodDays: 1,
      coachQuota: null,
      reportEnabled: true,
      reportPeriodDays: 7,
      reportQuota: null,
      toobit: false,
    },
  },
  {
    tier: "diamond",
    name: "الماسی",
    tint: "103,232,249",
    hex: "#67E8F9",
    monthlyPrice: 3950000,
    tagline: "بدون سقف، بدون صف، بدون ثبت دستی — کل میز تحلیل در اختیار توست.",
    badge: "کامل‌ترین",
    buttonText: "ارتقا به الماسی",
    features: [
      "ثبت نامحدود معامله",
      "تحلیل نامحدود هوش مصنوعی روی هر معامله",
      "مربی هوش مصنوعی نامحدود: بعد از هر معامله، هر ساعت، هر وقت خواستی — بدون هیچ صف انتظاری",
      "گزارش نهادی و بانکی نامحدود: قبل و بعد از هر تغییر استراتژی، اثرش را روی کارنامه‌ات بسنج",
      "اتصال مستقیم به صرافی توبیت: معاملات فیوچرزت خودکار ژورنال می‌شوند — بدون نیاز به ثبت دستی ژورنال",
      "خروجی PDF نهادی برای ارائه به سرمایه‌گذار و پراپ‌فرم",
      "تریدینگ پلن شخصی با دموهای آماده و همگام‌سازی با مربی هوش مصنوعی",
    ],
    highlights: [
      "همه‌چیز نامحدود",
      "مربی و گزارش نهادی بدون سقف",
      "اتصال خودکار به صرافی توبیت",
      "تریدینگ پلن شخصی",
    ],
    limits: {
      maxTrades: null,
      tradeAnalysis: "unlimited",
      tradeAnalysisQuota: null,
      coachEnabled: true,
      coachPeriodDays: null,
      coachQuota: null,
      reportEnabled: true,
      reportPeriodDays: null,
      reportQuota: null,
      toobit: true,
    },
  },
];

export const PLAN_BY_TIER: Record<Tier, Plan> = PLANS.reduce(
  (acc, p) => ({ ...acc, [p.tier]: p }),
  {} as Record<Tier, Plan>
);

export const TIER_LABEL: Record<Tier, string> = {
  bronze: "برنزی",
  silver: "نقره‌ای",
  gold: "طلایی",
  diamond: "الماسی",
};

export const TIER_TINT: Record<Tier, string> = {
  bronze: "251,146,60",
  silver: "148,163,184",
  gold: "251,191,36",
  diamond: "103,232,249",
};

/**
 * The tier actually in effect — an expired paid plan counts as bronze, exactly
 * like `effective_plan()` does on the server.
 */
export function effectiveTier(user: User | null | undefined): Tier {
  const raw = (user?.subscriptionTier || "bronze").toLowerCase() as Tier;
  const tier: Tier = raw in PLAN_BY_TIER ? raw : "bronze";
  if (tier === "bronze") return tier;
  const expires = user?.subscriptionExpiresAt;
  if (expires && new Date(expires).getTime() < Date.now()) return "bronze";
  return tier;
}

export function limitsOf(user: User | null | undefined): PlanLimits {
  return PLAN_BY_TIER[effectiveTier(user)].limits;
}

/** Human cadence for a feature, e.g. «هر روز ۱ بار» / «نامحدود». */
export function cadenceLabel(
  enabled: boolean,
  periodDays: number | null,
  quota: number | null = null
): string {
  if (!enabled || quota === 0) return "در این پلن فعال نیست";
  if (quota !== null) return quota === 1 ? "فقط ۱ بار (رایگان)" : `فقط ${quota} بار (رایگان)`;
  if (periodDays === null) return "نامحدود";
  if (periodDays === 1) return "روزی ۱ بار";
  if (periodDays === 7) return "هفته‌ای ۱ بار";
  return `هر ${periodDays} روز ۱ بار`;
}

/** The cheapest tier that unlocks a given capability — used in upgrade prompts. */
export function cheapestTierWith(pick: (l: PlanLimits) => boolean): Plan {
  return PLANS.find((p) => pick(p.limits)) ?? PLANS[PLANS.length - 1];
}
