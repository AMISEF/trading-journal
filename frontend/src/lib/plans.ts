/**
 * Subscription catalogue — the single place the UI learns what each tier costs,
 * unlocks and promises.
 *
 * The `limits` block mirrors `backend/app/services/plans.py` one-to-one. The
 * backend stays the authority (every quota is re-checked there); this copy only
 * exists so the interface can hide or lock what the API would refuse anyway,
 * instead of letting the user press a button that returns 403.
 *
 * Billing periods live in the subscription page: the monthly price below is the
 * base, and 3/6/12-month periods apply the standing discount to it.
 */
import type { User } from "@/lib/types";

export type Tier = "bronze" | "silver" | "gold" | "diamond";

export interface PlanLimits {
  /** null = unlimited */
  maxTrades: number | null;
  /** "once" = a trade may be analysed a single time, ever */
  tradeAnalysis: "once" | "unlimited";
  coachEnabled: boolean;
  /** null = no cooldown (unlimited) */
  coachPeriodDays: number | null;
  reportEnabled: boolean;
  reportPeriodDays: number | null;
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
    tagline: "اولین ۱۰ معامله‌ات را حرفه‌ای ثبت کن و ببین ژورنال چه چیزی از تو رو می‌کند.",
    badge: null,
    buttonText: "شروع رایگان",
    features: [
      "ثبت ۱۰ معامله با تمام جزئیات: ورود پله‌ای، حد ضرر، تارگت‌ها، تصویر چارت، چک‌لیست و احساسات",
      "۱ تحلیل هوش مصنوعی روی هر معامله — کیفیت اجرای تو نمره می‌گیرد، نه سود و ضررت",
      "داشبورد کامل: وین‌ریت، فاکتور سود، R:R و منحنی رشد سرمایه",
    ],
    highlights: ["ثبت ۱۰ معامله", "۱ تحلیل هوش مصنوعی روی هر معامله", "داشبورد کامل و منحنی سرمایه"],
    limits: {
      maxTrades: 10,
      tradeAnalysis: "once",
      coachEnabled: false,
      coachPeriodDays: null,
      reportEnabled: false,
      reportPeriodDays: null,
      toobit: false,
    },
  },
  {
    tier: "silver",
    name: "نقره‌ای",
    tint: "148,163,184",
    hex: "#94A3B8",
    monthlyPrice: 349000,
    tagline: "هر هفته یک گزارش که می‌گوید پولت دقیقاً از کجا نشت می‌کند.",
    badge: null,
    buttonText: "ارتقا به نقره‌ای",
    features: [
      "ثبت تا ۱۰۰ معامله با تمام جزئیات",
      "تحلیل نامحدود هوش مصنوعی روی هر معامله — هر بار پلن یا خروجت را عوض کردی، دوباره بررسی کن",
      "مربی هوش مصنوعی روی کل ژورنال، هفته‌ای ۱ بار: نقاط قوت، نشتی‌های پول و برنامهٔ ۷ روزهٔ بهبود",
      "گفتگوی نامحدود با مربی دربارهٔ همان تحلیل‌ها",
    ],
    highlights: ["ثبت تا ۱۰۰ معامله", "تحلیل نامحدود هوش مصنوعی هر معامله", "مربی هوش مصنوعی هفتگی"],
    limits: {
      maxTrades: 100,
      tradeAnalysis: "unlimited",
      coachEnabled: true,
      coachPeriodDays: 7,
      reportEnabled: false,
      reportPeriodDays: null,
      toobit: false,
    },
  },
  {
    tier: "gold",
    name: "طلایی",
    tint: "251,191,36",
    hex: "#FBBF24",
    monthlyPrice: 999000,
    tagline: "ریتم تریدر تمام‌وقت: بازخورد روزانه، پیش از اینکه اشتباه دیروز تکرار شود.",
    badge: "محبوب‌ترین",
    buttonText: "ارتقا به طلایی",
    features: [
      "ثبت نامحدود معامله — بدون هیچ سقفی",
      "تحلیل نامحدود هوش مصنوعی روی تک‌تک معاملات",
      "مربی هوش مصنوعی، هر روز ۱ بار: عیب‌یابی روزانه پیش از باز کردن پوزیشن بعدی",
      "گزارش نهادی و بانکی، هفته‌ای ۱ بار: همان استانداردی که پراپ‌فرم‌ها با آن سرمایه می‌دهند",
      "خروجی PDF گزارش نهادی برای ارائه به سرمایه‌گذار",
    ],
    highlights: ["ثبت نامحدود معامله", "مربی هوش مصنوعی روزانه", "گزارش نهادی هفتگی"],
    limits: {
      maxTrades: null,
      tradeAnalysis: "unlimited",
      coachEnabled: true,
      coachPeriodDays: 1,
      reportEnabled: true,
      reportPeriodDays: 7,
      toobit: false,
    },
  },
  {
    tier: "diamond",
    name: "الماسی",
    tint: "103,232,249",
    hex: "#67E8F9",
    monthlyPrice: 1999000,
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
    ],
    highlights: [
      "همه‌چیز نامحدود",
      "مربی و گزارش نهادی بدون سقف",
      "اتصال خودکار به صرافی توبیت",
    ],
    limits: {
      maxTrades: null,
      tradeAnalysis: "unlimited",
      coachEnabled: true,
      coachPeriodDays: null,
      reportEnabled: true,
      reportPeriodDays: null,
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
export function cadenceLabel(enabled: boolean, periodDays: number | null): string {
  if (!enabled) return "در این پلن فعال نیست";
  if (periodDays === null) return "نامحدود";
  if (periodDays === 1) return "روزی ۱ بار";
  if (periodDays === 7) return "هفته‌ای ۱ بار";
  return `هر ${periodDays} روز ۱ بار`;
}

/** The cheapest tier that unlocks a given capability — used in upgrade prompts. */
export function cheapestTierWith(pick: (l: PlanLimits) => boolean): Plan {
  return PLANS.find((p) => pick(p.limits)) ?? PLANS[PLANS.length - 1];
}
