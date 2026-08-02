/** داده، پالت و ابعادِ «تصویر برایند». */
import type { DashboardData } from "./types";
import type { Theme } from "./theme";

/* ابعادِ خروجی */

export type CardAspect = "16x9" | "9x16" | "3x4" | "4x3" | "1x1";

export interface AspectDef {
  id: CardAspect;
  label: string;
  hint: string;
  w: number;
  h: number;
}

export const CARD_ASPECTS: AspectDef[] = [
  { id: "16x9", label: "۱۶:۹ افقی", hint: "یوتیوب / توییتر", w: 1920, h: 1080 },
  { id: "9x16", label: "۱۶:۹ عمودی", hint: "استوری و ریلز", w: 1080, h: 1920 },
  { id: "3x4", label: "۳:۴ عمودی", hint: "پست اینستاگرام", w: 1080, h: 1440 },
  { id: "4x3", label: "۳:۴ افقی", hint: "بنر افقی", w: 1600, h: 1200 },
  { id: "1x1", label: "۱:۱ مربع", hint: "پست مربع", w: 1400, h: 1400 },
];

export const aspectDef = (id: CardAspect): AspectDef =>
  CARD_ASPECTS.find((a) => a.id === id) ?? CARD_ASPECTS[0];

/* بازهٔ برایند */

export type CardPeriod = "daily" | "weekly" | "monthly" | "all";

export const CARD_PERIODS: { id: CardPeriod; label: string; title: string }[] = [
  { id: "daily", label: "روزانه", title: "بازدهی روزانه" },
  { id: "weekly", label: "هفتگی", title: "بازدهی هفتگی" },
  { id: "monthly", label: "ماهانه", title: "بازدهی ماهانه" },
  { id: "all", label: "کل دوره", title: "بازدهی کل دوره" },
];

/* پالتِ تم‌ها (هم‌نام با تم‌های سایت) */

export interface CardPalette {
  id: Theme;
  label: string;
  bg: [string, string, string];
  panel: string;
  panelTop: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  profit: string;
  loss: string;
  grid: string;
  onAccent: string;
  isDark: boolean;
}

export const CARD_PALETTES: Record<Theme, CardPalette> = {
  classic: {
    id: "classic", label: "کلاسیک", bg: ["#04101D", "#0A1622", "#102941"],
    panel: "rgba(255,255,255,0.035)", panelTop: "rgba(255,255,255,0.085)",
    border: "rgba(125,211,252,0.20)", text: "#EAF4FF", muted: "#8FA6BF",
    accent: "#38BDF8", accent2: "#A78BFA", profit: "#34D399", loss: "#F87171",
    grid: "rgba(148,197,255,0.07)", onAccent: "#04121F", isDark: true,
  },
  ocean: {
    id: "ocean", label: "دارک اوشن", bg: ["#0B1D38", "#162F55", "#214E8A"],
    panel: "rgba(255,255,255,0.05)", panelTop: "rgba(255,255,255,0.10)",
    border: "rgba(111,149,200,0.30)", text: "#F3F6F9", muted: "#A9BDD8",
    accent: "#6F95C8", accent2: "#19C3B3", profit: "#4ED9CC", loss: "#FB7185",
    grid: "rgba(191,199,206,0.08)", onAccent: "#0B1D38", isDark: true,
  },
  dark: {
    id: "dark", label: "دارک", bg: ["#191E22", "#2B3136", "#3A444C"],
    panel: "rgba(255,255,255,0.045)", panelTop: "rgba(255,255,255,0.09)",
    border: "rgba(220,226,231,0.16)", text: "#F3F6F9", muted: "#AEB8C1",
    accent: "#19C3B3", accent2: "#A6F0E8", profit: "#34D399", loss: "#F87171",
    grid: "rgba(220,226,231,0.07)", onAccent: "#12181C", isDark: true,
  },
  light: {
    id: "light", label: "روشن", bg: ["#FFFFFF", "#F3F6F9", "#DCE6F2"],
    panel: "rgba(22,47,85,0.045)", panelTop: "rgba(255,255,255,0.85)",
    border: "rgba(22,47,85,0.14)", text: "#16233A", muted: "#5A6B80",
    accent: "#2D63B0", accent2: "#128F84", profit: "#0F9D6B", loss: "#DC2F3F",
    grid: "rgba(22,47,85,0.07)", onAccent: "#FFFFFF", isDark: false,
  },
  soft: {
    id: "soft", label: "روشن ملایم", bg: ["#E7ECF1", "#BFC7CE", "#9FAAB5"],
    panel: "rgba(255,255,255,0.45)", panelTop: "rgba(255,255,255,0.78)",
    border: "rgba(43,49,54,0.16)", text: "#1F262B", muted: "#525C66",
    accent: "#214E8A", accent2: "#128F84", profit: "#0F9D6B", loss: "#D02F3F",
    grid: "rgba(43,49,54,0.08)", onAccent: "#FFFFFF", isDark: false,
  },
  barbie: {
    id: "barbie", label: "باربی گرل", bg: ["#FFF0F7", "#FFC2DF", "#FF8FC4"],
    panel: "rgba(255,255,255,0.48)", panelTop: "rgba(255,255,255,0.82)",
    border: "rgba(228,50,127,0.26)", text: "#5C0F36", muted: "#9C4370",
    accent: "#E4327F", accent2: "#FF6FB0", profit: "#12A37A", loss: "#D81B60",
    grid: "rgba(228,50,127,0.10)", onAccent: "#FFFFFF", isDark: false,
  },
  cinderella: {
    id: "cinderella", label: "سیندرلا", bg: ["#F4EEFF", "#D6C6FF", "#B18CFF"],
    panel: "rgba(255,255,255,0.46)", panelTop: "rgba(255,255,255,0.82)",
    border: "rgba(124,58,237,0.24)", text: "#2E1065", muted: "#6B4CA8",
    accent: "#7C3AED", accent2: "#A78BFA", profit: "#0E9F6E", loss: "#E11D48",
    grid: "rgba(124,58,237,0.10)", onAccent: "#FFFFFF", isDark: false,
  },
};

export const CARD_THEMES: CardPalette[] = [
  CARD_PALETTES.classic,
  CARD_PALETTES.ocean,
  CARD_PALETTES.dark,
  CARD_PALETTES.light,
  CARD_PALETTES.soft,
  CARD_PALETTES.barbie,
  CARD_PALETTES.cinderella,
];

/* قالب‌بندی اعداد */

export const usd = (v: number, digits = 2) =>
  `${v < 0 ? "-" : ""}$${Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
export const signedUsd = (v: number) => `${v > 0 ? "+" : ""}${usd(v)}`;
export const pctText = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined || Number.isNaN(v) ? "—" : `${v.toFixed(digits)}%`;
export const signedPct = (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

/** درصدهایی که به‌صورت کسری (۰ تا ۱) می‌آیند؛ فقط برای همین فیلدها. */
export function asPercent(v: number | null | undefined): number | null {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return Math.abs(v) <= 1.5 ? v * 100 : v;
}

/* آمارِ کارت */

export interface EquityPoint {
  balance: number;
  pnl: number;
  date: string | null;
}

export interface CardStats {
  pnlUsd: number;
  pnlPct: number;
  balance: number;
  winRate: number | null;
  avgRr: number;
  profitFactor: number;
  ddUsd: number;
  ddPct: number;
  win: number;
  loss: number;
  be: number;
  avgWin: number | null;
  avgLoss: number | null;
  long: number;
  short: number;
  longWr: number | null;
  shortWr: number | null;
  trades: number;
  closed: number;
  equity: number[];
  equityPoints: EquityPoint[];
  periodTitle: string;
  periodLabel: string;
}

const dayKey = (s: string) => s.slice(0, 10);

function sumLastDays(days: { date: string; pnl: number }[], n: number): number {
  if (!days.length) return 0;
  const last = dayKey(days[days.length - 1].date);
  const end = new Date(`${last}T00:00:00`);
  const start = new Date(end);
  start.setDate(end.getDate() - (n - 1));
  const from = start.toISOString().slice(0, 10);
  return days.reduce((a, d) => (dayKey(d.date) >= from ? a + d.pnl : a), 0);
}

export function buildStats(data: DashboardData, period: CardPeriod): CardStats {
  const days = [...(data.pnlByDay ?? [])].sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((a, d) => a + d.pnl, 0);
  const pnlUsd =
    period === "daily" ? sumLastDays(days, 1)
      : period === "weekly" ? sumLastDays(days, 7)
      : period === "monthly" ? sumLastDays(days, 30)
      : total;
  const balance = data.currentBalance ?? 0;
  const base = balance - pnlUsd;
  const pnlPct = base > 0 ? (pnlUsd / base) * 100 : 0;
  const meta = CARD_PERIODS.find((p) => p.id === period) ?? CARD_PERIODS[3];
  const wl = data.winLoss ?? { win: 0, loss: 0, breakeven: 0, avgWin: null, avgLoss: null };
  const ds = data.directionStats ?? { long: 0, short: 0 };

  const win = wl.win ?? 0;
  const loss = wl.loss ?? 0;
  const decided = win + loss;
  const winRate = decided > 0 ? (win / decided) * 100 : asPercent(data.winRate);

  const long = ds.long ?? 0;
  const short = ds.short ?? 0;
  const longWr =
    ds.longWins !== undefined && ds.longWins !== null && long > 0
      ? (ds.longWins / long) * 100
      : asPercent(ds.longWinRate);
  const shortWr =
    ds.shortWins !== undefined && ds.shortWins !== null && short > 0
      ? (ds.shortWins / short) * 100
      : asPercent(ds.shortWinRate);

  const points: EquityPoint[] = (data.equityCurve ?? []).map((p) => ({
    balance: p.balance,
    pnl: p.pnl,
    date: p.date ?? null,
  }));

  return {
    pnlUsd,
    pnlPct,
    balance,
    winRate,
    avgRr: data.avgRr ?? 0,
    profitFactor: data.profitFactor ?? 0,
    // بک‌اند درصد دراوداون را همین‌جوری (۰ تا ۱۰۰) می‌دهد — مقیاس نمی‌شود.
    ddUsd: Math.abs(data.maxDrawdown?.amount ?? 0),
    ddPct: Math.abs(data.maxDrawdown?.percent ?? 0),
    win,
    loss,
    be: wl.breakeven ?? 0,
    avgWin: wl.avgWin ?? null,
    avgLoss: wl.avgLoss ?? null,
    long,
    short,
    longWr,
    shortWr,
    trades: data.tradeCount ?? 0,
    closed: data.closedCount ?? 0,
    equity: points.map((p) => p.balance),
    equityPoints: points,
    periodTitle: meta.title,
    periodLabel: meta.label,
  };
}

/* برند و کپشن */

export const SITE_URL = "https://" + "algohub.cryptosmart.site";
export const SITE_LABEL = "algohub.cryptosmart.site";
export const TELEGRAM_ID = "ALGOHUB_ORG";
export const SHARE_SLOGAN =
  "برایندت رو بساز، نه ادعا! ژورنالِ حرفه‌ای + تحلیل هوش مصنوعی + لیگ تریدرها — همین حالا رایگان در الگو هاب شروع کن 🚀";

export function shareCaption(data: DashboardData, period: CardPeriod, name: string): string {
  const s = buildStats(data, period);
  return [
    `📊 ${s.periodTitle} ژورنالِ ${name || "من"}`,
    `${s.pnlPct >= 0 ? "🟢" : "🔴"} بازدهی: ${signedPct(s.pnlPct)} (${signedUsd(s.pnlUsd)})`,
    `🎯 وین‌ریت: ${pctText(s.winRate, 1)} | ⚖️ میانگین R:R: ${s.avgRr.toFixed(2)} | 💹 ضریب سود: ${s.profitFactor.toFixed(2)}`,
    "",
    SHARE_SLOGAN,
    `🌐 ${SITE_LABEL}`,
    `✈️ @${TELEGRAM_ID}`,
    "",
    "#الگوهاب #AlgoHub #CryptoSmart #ژورنال_معاملاتی #تریدینگ #کریپتو",
  ].join("\n");
}
